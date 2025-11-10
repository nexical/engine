import sys
from orchestrator import Orchestrator


def main():
    """The main entry point for the CLI application."""
    orchestrator = Orchestrator(sys.argv)
    orchestrator.run()


if __name__ == "__main__":
    main()
