import time
import os
import requests

class CloudflareService:
    """A wrapper for the Cloudflare API to monitor Pages deployments."""

    BASE_URL = "https://api.cloudflare.com/client/v4"

    def __init__(self, api_token: str, account_id: str):
        """
        Initializes the service with a Cloudflare API token and account ID.
        """
        if not api_token or not account_id:
            raise ValueError("Cloudflare API token and account ID are required.")
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }
        self.account_id = account_id
        print("CloudflareService initialized.")

    def _get_latest_deployment(self, project_name: str):
        """Gets the latest deployment for a specific Pages project."""
        url = f"{self.BASE_URL}/accounts/{self.account_id}/pages/projects/{project_name}/deployments"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        deployments = response.json()["result"]
        if not deployments:
            raise Exception("No deployments found for this project.")
        return deployments[0] # The first one is the latest

    def wait_for_build(self, project_name: str, environment: str) -> None:
        """
        Polls the Cloudflare API until the latest deployment for a given
        environment is successful.
        """
        print(f"Waiting for Cloudflare build of '{project_name}' in '{environment}' environment.")
        
        while True:
            try:
                latest_deployment = self._get_latest_deployment(project_name)
                
                # We only care about the environment we are deploying to
                if latest_deployment["environment"] != environment:
                    print(f"Latest deployment is for '{latest_deployment['environment']}', waiting for '{environment}'...")
                    time.sleep(20)
                    continue

                status = latest_deployment["latest_stage"]["status"]
                print(f"Current deployment status: {status}")

                if status == "success":
                    print("Cloudflare build successful.")
                    break
                elif status in ["failure", "canceled"]:
                    raise Exception(f"Cloudflare deployment failed with status: {status}")
                
                # If still building, wait and poll again
                time.sleep(30)

            except requests.exceptions.RequestException as e:
                print(f"Error communicating with Cloudflare API: {e}")
                raise
            except Exception as e:
                print(f"An error occurred: {e}")
                raise
