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

            except Exception as e:
                print(f"An error occurred: {e}")
                raise

    def get_project(self, project_name: str):
        """Checks if a project exists."""
        url = f"{self.BASE_URL}/accounts/{self.account_id}/pages/projects/{project_name}"
        try:
            response = requests.get(url, headers=self.headers)
            if response.status_code == 200:
                return response.json()["result"]
            return None
        except requests.exceptions.RequestException:
            return None

    def create_project(self, project_name: str):
        """Creates a new Pages project."""
        url = f"{self.BASE_URL}/accounts/{self.account_id}/pages/projects"
        payload = {
            "name": project_name,
            "production_branch": "main",
            # Add other defaults as needed
        }
        print(f"Creating Cloudflare Pages project: {project_name}")
        response = requests.post(url, headers=self.headers, json=payload)
        response.raise_for_status()
        return response.json()["result"]

    def add_domain(self, project_name: str, domain: str):
        """Links a custom domain to the project."""
        url = f"{self.BASE_URL}/accounts/{self.account_id}/pages/projects/{project_name}/domains"
        payload = {"name": domain}
        print(f"Linking domain '{domain}' to project '{project_name}'")
        try:
            response = requests.post(url, headers=self.headers, json=payload)
            response.raise_for_status()
            return response.json()["result"]
        except requests.exceptions.HTTPError as e:
            # If domain already exists, it might return 409 or similar, handle gracefully if needed
            print(f"Failed to add domain: {e}")
            # For now, we raise to be safe, but could ignore if "already exists"
            raise

