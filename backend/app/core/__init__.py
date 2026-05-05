"""
Pure-Python core modules extracted from the original Streamlit app.

These modules contain the analytical engine (price fetch, profit math,
recipe loader, transport calculator). They have NO Streamlit dependency
and can be imported by any Python process — FastAPI routes, scheduled
jobs, CLI tools.

The original Streamlit app under `files/` is unchanged; this is a copy
with paths re-anchored so caches resolve relative to this package.
"""
