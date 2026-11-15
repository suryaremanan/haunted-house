"""S10 reference runner: one structured command inside a macOS Seatbelt sandbox.

Spike code, standard library only.  It is the smallest runner that the
``doors-and-guardrails`` command and git actions could sit on, written to find
out which confinement claims can be *proven* on this host:

* deny-by-default file, network and process policy from ``sandbox-exec``;
* writes only below the Mansion, never into Protected_Paths;
* a scrubbed, fixed environment and a validated working directory;
* no child processes unless the caller explicitly accepts that weaker mode;
* a refusal before start when the tree holds a multiply linked file;
* a timeout that kills the whole process group, and bounded output.

There is no shell, no caller environment, and no fallback: when the sandbox
is missing the result is ``confinement_unavailable`` and nothing starts.
"""
from __future__ import annotations

import os
import shutil
import signal
import stat
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

SANDBOX_EXEC = "/usr/bin/sandbox-exec"
TRUSTED_ENV = {
    "PATH": "/usr/bin:/bin",
    "HOME": "/var/empty",
    "LANG": "C",
    "LC_ALL": "C",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_OPTIONAL_LOCKS": "0",
}
SYSTEM_READ_ROOTS = (
    "/usr",
    "/bin",
    "/sbin",
    "/System",
    "/Library",
    "/private/etc",
    "/private/var/db",
    "/dev",
)
# Later rules win in SBPL, so the Protected_Path denials sit after the allows.
PROFILE = """(version 1)
(deny default)
(allow process-exec)
{fork}
(allow signal (target self))
(allow sysctl-read)
(allow file-read-metadata)
(allow file-read* (literal "/") {system_roots} {tool_roots})
(allow file-write* (literal "/dev/null"))
(allow file-read* (subpath (param "MANSION")))
(allow file-write* (subpath (param "MANSION")))
(deny file-read* file-write* (subpath (param "PRIVATE")))
{git}
"""


@dataclass(frozen=True)
class Result:
    """Content-free outcome.  ``output`` is bounded and for the caller only."""

    status: str  # completed | timeout | refused
    code: str
    returncode: int | None = None
    output: str = ""


def sandbox_available() -> bool:
    return sys.platform == "darwin" and os.access(SANDBOX_EXEC, os.X_OK)


def find_multiply_linked(root: Path) -> bool:
    """True when any regular file below *root* has more than one hard link.

    Seatbelt rules are path based: a second name for an outside inode that
    already sits inside the Mansion is writable through the sandbox.  The
    sandbox stops a confined process from creating such a link, so refusing
    to start while one exists closes the gap.
    """
    for directory, names, files in os.walk(root, followlinks=False):
        for name in files:
            info = os.lstat(os.path.join(directory, name))
            if stat.S_ISREG(info.st_mode) and info.st_nlink > 1:
                return True
    return False


def build_profile(*, allow_fork: bool, git_write: bool, tool_roots: Sequence[str]) -> str:
    def subpaths(roots: Sequence[str]) -> str:
        return " ".join(f'(subpath "{root}")' for root in roots)

    for root in tool_roots:
        if not os.path.isabs(root) or '"' in root or "\\" in root:
            raise ValueError("unsafe tool root")
    return PROFILE.format(
        fork="(allow process-fork)" if allow_fork else "",
        system_roots=subpaths(SYSTEM_READ_ROOTS),
        tool_roots=subpaths(tool_roots),
        git="" if git_write else '(deny file-write* (subpath (param "GITDIR")))',
    )


def run_confined(
    argv: Sequence[str],
    *,
    mansion: Path,
    cwd: Path,
    git_write: bool = False,
    allow_fork: bool = False,
    tool_roots: Sequence[str] = (),
    timeout: float = 20.0,
    max_output: int = 4096,
    confine: bool = True,
    scan_links: bool = True,
) -> Result:
    """Run exact *argv* confined to *mansion*.

    ``confine=False`` (control run) and ``scan_links=False`` (shows what the
    pre-start scan prevents) exist for the probe only; an adapter passes neither.
    """
    if not argv or not os.path.isabs(argv[0]) or any("\x00" in part for part in argv):
        return Result("refused", "invalid_command")
    real_mansion = os.path.realpath(mansion)
    if os.fspath(mansion) != real_mansion or not os.path.isdir(real_mansion):
        return Result("refused", "mansion_unavailable")
    real_cwd = os.path.realpath(cwd)
    if os.fspath(cwd) != real_cwd or os.path.commonpath([real_cwd, real_mansion]) != real_mansion:
        return Result("refused", "cwd_denied")
    if confine and not sandbox_available():
        return Result("refused", "confinement_unavailable")
    if confine and scan_links and find_multiply_linked(mansion):
        return Result("refused", "hard_link_present")
    command = list(argv)
    if confine:
        profile = build_profile(allow_fork=allow_fork, git_write=git_write, tool_roots=tool_roots)
        command = [
            SANDBOX_EXEC,
            "-D",
            f"MANSION={real_mansion}",
            "-D",
            f"PRIVATE={real_mansion}/.haunted-house",
            "-D",
            f"GITDIR={real_mansion}/.git",
            "-p",
            profile,
            *command,
        ]
    process = subprocess.Popen(  # noqa: S603 - exact argv, no shell
        command,
        cwd=real_cwd,
        env=dict(TRUSTED_ENV),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    try:
        raw, _ = process.communicate(timeout=timeout)
        status = "completed"
    except subprocess.TimeoutExpired:
        status = "timeout"
        raw = b""
    finally:
        # Reap everything still in the command's process group, finished or not.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        if process.poll() is None:
            process.wait()
    output = raw[:max_output].decode("utf-8", "replace")
    if status == "timeout":
        return Result("timeout", "timed_out", None, output)
    return Result("completed", "exited", process.returncode, output)


def resolve_git() -> tuple[str, str] | None:
    """The real git binary and its install root, bypassing the Xcode shim."""
    candidates = [
        "/Library/Developer/CommandLineTools/usr/bin/git",
        "/Applications/Xcode.app/Contents/Developer/usr/bin/git",
        "/opt/homebrew/bin/git",
        "/usr/local/bin/git",
    ]
    found = shutil.which("git", path="/opt/homebrew/bin:/usr/local/bin")
    if found:
        candidates.append(found)
    for candidate in candidates:
        real = os.path.realpath(candidate)
        if os.path.isfile(real) and os.access(real, os.X_OK):
            return real, os.path.dirname(os.path.dirname(real))
    return None
