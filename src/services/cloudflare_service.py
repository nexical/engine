import time

class CloudflareService:
    """A wrapper for the Cloudflare API."""

    def __init__(self, api_token: str):
        """Initializes the service with a Cloudflare API token."""
        self.api_token = api_token
        print("CloudflareService initialized.")

    def wait_for_build(self, project_name: str, environment: str) -> None:
        """Polls the Cloudflare API until a deployment build is complete."""
        print(f"Mock Cloudflare: Waiting for build of '{project_name}' in '{environment}' environment.")
        time.sleep(1) # Simulate a short wait
        print("Mock Cloudflare: Build complete.")
