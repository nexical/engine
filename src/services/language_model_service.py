import os
from litellm import completion, image_generation
import logging

class LanguageModelService:
    """
    Provides a wrapper around language and image generation model APIs using LiteLLM.
    """

    def __init__(self):
        """
        Initializes the service. It relies on LiteLLM to automatically handle
        API keys from environment variables (e.g., OPENAI_API_KEY, ANTHROPIC_API_KEY).
        """
        # LiteLLM reads API keys from environment variables automatically.
        # No explicit api_key parameter is needed in the constructor.
        logging.info("LanguageModelService initialized.")

    def query(self, prompt: str, model: str = None) -> str:
        """
        Sends a prompt to a language model and returns the text response.

        Args:
            prompt: The prompt to send to the language model.
            model: The model to use for the completion (e.g., 'gpt-4', 'claude-2').
                   If None, LiteLLM's default is used.

        Returns:
            The text response from the model.
        """
        model = model or os.getenv("LITELLM_MODEL", "gpt-4")
        try:
            logging.info(f"Sending query to model: {model}")
            response = completion(
                model=model,
                messages=[{"content": prompt, "role": "user"}]
            )
            # The response object from LiteLLM is a ModelResponse object.
            # The content is in response.choices[0].message.content
            content = response.choices[0].message.content
            logging.info("Successfully received response from model.")
            return content
        except Exception as e:
            logging.error(f"An error occurred while querying the language model: {e}")
            # Depending on the desired error handling, you might want to raise the exception,
            # return a specific error message, or return None.
            raise

    def imagine(self, prompt: str, model: str = None, output_path: str = None) -> str:
        """
        Generates an image from a text prompt and saves it to a file.

        Args:
            prompt: The text prompt for image generation.
            model: The model to use for image generation (e.g., 'dall-e-3').
                   If None, LiteLLM's default is used.
            output_path: The path to save the generated image.

        Returns:
            The path to the saved image file.
        """
        model = model or os.getenv("LITELLM_IMAGE_MODEL", "dall-e-3")
        try:
            logging.info(f"Sending image generation request to model: {model}")
            response = image_generation(
                model=model,
                prompt=prompt
            )
            # The response object gives a URL to the image
            image_url = response.data[0].url
            
            # To save the image, we need to fetch it from the URL
            import requests
            image_response = requests.get(image_url)
            image_response.raise_for_status() # Raise an exception for bad status codes

            if output_path:
                with open(output_path, 'wb') as f:
                    f.write(image_response.content)
                logging.info(f"Image successfully generated and saved to {output_path}")
                return output_path
            
            # If no output path, maybe return the binary content or a base64 string?
            # For now, we require an output path.
            raise ValueError("output_path is required to save the generated image.")

        except Exception as e:
            logging.error(f"An error occurred during image generation: {e}")
            raise
