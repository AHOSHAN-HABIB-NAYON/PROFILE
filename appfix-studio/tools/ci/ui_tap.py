#!/usr/bin/env python3
"""Taps the first on-screen element whose text or content-description equals the argument (uiautomator dump)."""
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET


def dump():
    subprocess.run(["adb", "shell", "uiautomator", "dump", "/sdcard/ui.xml"], check=True, capture_output=True)
    return subprocess.run(["adb", "shell", "cat", "/sdcard/ui.xml"], check=True, capture_output=True, text=True).stdout


def find(label):
    xml = dump()
    root = ET.fromstring(xml[xml.index("<"):])
    for node in root.iter("node"):
        if label in (node.get("text"), node.get("content-desc")):
            m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def main():
    label, timeout = sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 20
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            pos = find(label)
        except Exception as e:  # uiautomator can fail while the UI is changing
            print(f"dump failed: {e}", file=sys.stderr)
            pos = None
        if pos:
            subprocess.run(["adb", "shell", "input", "tap", str(pos[0]), str(pos[1])], check=True)
            print(f"tapped '{label}' at {pos}")
            return
        time.sleep(1)
    print(f"'{label}' not found on screen", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
