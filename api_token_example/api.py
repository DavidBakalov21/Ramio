import os
import requests

API_URL = "https://ramio-lms.com/api"  
TOKEN ="your_api_token_here"

session = requests.Session()
session.headers["Authorization"] = f"Bearer {TOKEN}"

courses = session.get(f"{API_URL}/course").json()
print(courses)


new_course = session.post(
    f"{API_URL}/course",
    json={"title": "From Python", "description": "Automated setup"},
).json()
print(new_course)