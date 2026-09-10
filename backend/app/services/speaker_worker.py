"""Disposable CPU worker. Emits only meeting-local IDs and time intervals."""
import json
import sys


def main():
    from . import speaker_models
    from .speakers import _acoustic_turns_in_process
    try:
        if len(sys.argv) < 2 or not speaker_models.ready():
            return 1
        turns = _acoustic_turns_in_process(sys.argv[-1])
        print(json.dumps(turns), flush=True)
        return 0
    except Exception:
        return 1


if __name__ == '__main__':
    sys.exit(main())
