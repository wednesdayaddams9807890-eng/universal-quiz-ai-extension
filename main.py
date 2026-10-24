
import os
import re
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

app = FastAPI(title="Universal Quiz AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class QuizRequest(BaseModel):
    question: str
    options: List[str]


api_key = os.getenv("GROQ_API_KEY")
client = Groq(api_key=api_key) if api_key else None


@app.get("/")
def home():
    return {"message": "Universal Quiz AI backend is running!"}


@app.post("/api/suggest")
def suggest_answer(data: QuizRequest):
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY .env file mein nahi mili."
        )

    question = data.question.strip()
    raw_options = [item.strip() for item in data.options if item.strip()]

    print("Received question:", repr(question))
    print("Received options:", repr(raw_options))

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question scan nahi hua. Question dobara select karein."
        )

    # Accept options such as "A. Paris" or "Paris".
    options = []
    for item in raw_options:
        match = re.match(r"^([A-D])\s*[.)]\s*(.+)$", item, re.I)
        if match:
            label = match.group(1).upper()
            text = match.group(2).strip()
        else:
            label = chr(65 + len(options))
            text = item.strip()

        if text and text.upper() not in {"A", "B", "C", "D"}:
            options.append({"label": label, "text": text})

    if len(options) < 2:
        raise HTTPException(
            status_code=400,
            detail=(
                "Actual MCQ options scan nahi huay. "
                "Question aur tamam options ko ek rectangle mein select karein."
            )
        )

    # Require real option text, not just letters.
    if all(
        option["text"].strip().rstrip(".").upper() in {"A", "B", "C", "D"}
        for option in options
    ):
        raise HTTPException(
            status_code=400,
            detail="Options ka actual text missing hai. Dobara scan karein."
        )

    options_text = "\n".join(
        f'{option["label"]}. {option["text"]}'
        for option in options
    )

    system_prompt = """
You are Universal Quiz AI, a careful and accurate MCQ solver.

Your task is to solve the question, not merely give a hint.

RULES:
1. Read the entire question and all provided options.
2. Choose the single best-supported option when the information is sufficient.
3. Match the answer to the exact text of the chosen option.
4. Never invent option text or guess missing information.
5. If essential text is missing or the question is ambiguous, clearly say so.
6. For grammar questions, apply the relevant grammar rule and explain it.
7. For analogy questions, explain the relationship between both pairs.
8. For vocabulary questions, explain the relevant word meanings.
9. For calculation questions, show the key calculation steps.
10. Do not claim certainty if the supplied information does not support it.

Use this complete format:

Correct Option: <letter>
Full Answer: <exact full text of the correct option>
Explanation: <clear explanation of why it is correct and why the closest alternative is not as suitable>

If the question cannot be solved from the supplied text, use:

Correct Option: Cannot determine
Full Answer: The question or options are incomplete.
Explanation: State exactly what information is missing.

Give a useful, direct explanation. Do not return only a hint.
"""

    user_prompt = (
        f"QUESTION:\n{question}\n\n"
        f"COMPLETE OPTIONS:\n{options_text}\n\n"
        "Solve this MCQ. Return the correct option letter, its exact full text, "
        "and a clear explanation. Do not return only a hint."
    )

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0,
            max_tokens=700,
        )

        choice = response.choices[0] if response.choices else None
        suggestion = (
            choice.message.content.strip()
            if choice and choice.message and choice.message.content
            else ""
        )

        if not suggestion:
            print(
                "Empty AI response. Finish reason:",
                getattr(choice, "finish_reason", None)
            )
            raise HTTPException(
                status_code=502,
                detail="AI ne empty response diya. Backend terminal check karein."
            )

        return {
            "question": question,
            "suggestion": suggestion,
        }

    except HTTPException:
        raise

    except Exception as exc:
        print(f"Groq error: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=502,
            detail=(
                f"AI request failed: {type(exc).__name__}. "
                "Backend terminal check karein."
            )
        )
