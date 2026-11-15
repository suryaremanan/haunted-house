"""Pure server scope registry derived from acknowledged canonical records.

A backend domain producer registers an Event_Scope by appending a
house-origin ``run_started`` record through the Canonical_Event_Writer.  The
registry is nothing but a fold over those acknowledged records, so it needs no
second store and survives a restart: the latest ``run_started`` in accepted
(Sequence) order for a session slot is that slot's registered scope.

Crew-origin records can never register a scope, and request data never
reaches this module.  It performs no I/O and reads no clock.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from types import MappingProxyType

from haunted_house.core.seance_event import AppEvent, EventScope

__all__ = [
    "RegisteredScope",
    "ScopeRegistry",
    "build_scope_registry",
]


@dataclass(frozen=True, slots=True)
class RegisteredScope:
    """One slot's registered scope and the record that registered it."""

    scope: EventScope
    registered_sequence: int
    registered_at_ms: int


@dataclass(frozen=True, slots=True)
class ScopeRegistry:
    """Registered scopes of one Mansion, keyed by session slot."""

    mansion_id: str
    by_slot: Mapping[str, RegisteredScope]

    @property
    def scope_by_slot(self) -> Mapping[str, EventScope]:
        return MappingProxyType(
            {slot: entry.scope for slot, entry in self.by_slot.items()}
        )

    def get(self, slot: object) -> RegisteredScope | None:
        if type(slot) is not str:
            return None
        return self.by_slot.get(slot)


def build_scope_registry(mansion_id: str, events: Sequence[AppEvent]) -> ScopeRegistry:
    """Fold acknowledged records of one Mansion into its scope registry.

    Only house-origin ``run_started`` records whose scope names
    ``mansion_id`` register a slot.  A later registration of the same slot
    (greater Sequence) replaces the earlier one, so a slot is always
    associated with at most one scope.  Input order does not matter.
    """

    by_slot: dict[str, RegisteredScope] = {}
    for event in events:
        if (
            event.event_type != "run_started"
            or event.source.origin != "house"
            or event.scope.mansion_id != mansion_id
        ):
            continue
        slot = event.scope.session_slot
        current = by_slot.get(slot)
        candidate = RegisteredScope(
            scope=event.scope,
            registered_sequence=event.sequence,
            registered_at_ms=event.persisted_at_ms,
        )
        if current is None or _order_key(candidate) > _order_key(current):
            by_slot[slot] = candidate
    return ScopeRegistry(mansion_id=mansion_id, by_slot=MappingProxyType(by_slot))


def _order_key(entry: RegisteredScope) -> tuple[int, int, str]:
    # Sequence decides.  The remaining fields only make invalid external
    # input (two records claiming one Sequence) deterministic.
    return (
        entry.registered_sequence,
        entry.scope.run_sequence,
        entry.scope.run_id,
    )
