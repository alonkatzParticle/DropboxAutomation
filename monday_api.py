"""
monday_api.py — Low-level Monday.com GraphQL API communication

Provides basic functions for making authenticated requests to the Monday.com API.
Handles GraphQL query/mutation execution and error handling.

Depends on: .env (for MONDAY_API_TOKEN)
Used by: monday_client.py
"""

import os
import requests
from dotenv import load_dotenv

load_dotenv()

MONDAY_API_URL = "https://api.monday.com/v2"


def get_headers() -> dict:
    """
    Return HTTP headers required for every Monday.com API request.
    Raises EnvironmentError if MONDAY_API_TOKEN is not configured.
    """
    token = os.getenv("MONDAY_API_TOKEN")
    if not token:
        raise EnvironmentError("MONDAY_API_TOKEN is missing from your .env file.")
    return {
        "Authorization": token,
        "Content-Type": "application/json",
        "API-Version": "2023-10"
    }


def run_query(query: str, variables: dict = None) -> dict:
    """
    Execute a GraphQL query or mutation on the Monday.com API.
    Returns the 'data' field from the response.

    Raises RuntimeError if Monday.com returns an error.
    Raises HTTPError if the HTTP request fails.

    query     — GraphQL query string
    variables — dict of variables to pass to the query
    """
    payload = {"query": query, "variables": variables or {}}

    try:
        response = requests.post(
            MONDAY_API_URL,
            json=payload,
            headers=get_headers(),
            timeout=30
        )
        response.raise_for_status()
    except requests.exceptions.Timeout:
        raise RuntimeError("Monday.com API request timed out after 30 seconds")
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Monday.com API request failed: {e}")

    data = response.json()
    if "errors" in data:
        raise RuntimeError(f"Monday.com API error: {data['errors']}")

    return data.get("data", {})
