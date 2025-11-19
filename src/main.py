import sys
from orchestrator import Orchestrator
from dotenv import load_dotenv


def main():
    """The main entry point for the CLI application."""
    load_dotenv()
    orchestrator = Orchestrator(sys.argv)
    orchestrator.run()


if __name__ == "__main__":
    main()
