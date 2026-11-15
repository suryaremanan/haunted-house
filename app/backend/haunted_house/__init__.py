"""Haunted House app backend.

Layers:
  core/      pure logic (no network, filesystem or clock reads)
  adapters/  everything that talks to Crew, the filesystem or the clock
  server.py  HTTP routes
"""
