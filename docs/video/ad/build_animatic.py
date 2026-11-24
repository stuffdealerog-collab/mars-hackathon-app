#!/usr/bin/env python3
"""Kept for old links: the animatic is built by assemble.py (same script makes the final cut)."""
import runpy
from pathlib import Path

runpy.run_path(str(Path(__file__).with_name("assemble.py")), run_name="__main__")
