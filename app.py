import os
import json
import joblib
import pandas as pd
from flask import Flask, render_template, request, jsonify

BASE = os.path.dirname(os.path.abspath(__file__))


def path(name):
    return os.path.join(BASE, name)


# Friendly check so folder-structure mistakes are obvious
for needed in ["templates/index.html", "static/style.css", "static/app.js"]:
    if not os.path.exists(path(needed)):
        print(f"\n[!] Missing file: {needed}  -> keep the 'templates' and 'static' folders next to app.py\n")

for needed in ["rf_model.pkl", "xgb_model.pkl", "meta.pkl", "metrics.json"]:
    if not os.path.exists(path(needed)):
        print(f"\n[!] Missing {needed}  -> run:  python train_and_save.py   first\n")

app = Flask(__name__)

rf_model = joblib.load(path("rf_model.pkl"))
xgb_model = joblib.load(path("xgb_model.pkl"))
meta = joblib.load(path("meta.pkl"))
with open(path("metrics.json")) as f:
    metrics = json.load(f)

# A sample of real employees for the 3D cloud on the page
points = []
if os.path.exists(path("employee_attrition_data.csv")):
    _df = pd.read_csv(path("employee_attrition_data.csv"))
    _sample = _df.sample(n=min(350, len(_df)), random_state=1)
    points = _sample[["JobSatisfaction", "WorkLifeBalance", "MonthlyIncome",
                      "YearsAtCompany", "Attrition"]].values.tolist()


@app.route("/")
def home():
    return render_template("index.html", metrics=metrics)


@app.route("/points")
def get_points():
    return jsonify(points)


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()

    input_df = pd.DataFrame([{
        "Age": int(data["age"]),
        "MonthlyIncome": int(data["monthlyIncome"]),
        "YearsAtCompany": int(data["yearsAtCompany"]),
        "JobSatisfaction": int(data["jobSatisfaction"]),
        "OverTime": 1 if data["overtime"] == "yes" else 0,
        "DistanceFromHome": int(data["distanceFromHome"]),
        "NumPromotions": int(data["numPromotions"]),
        "WorkLifeBalance": int(data["workLifeBalance"]),
        "PerformanceRating": int(data["performanceRating"])
    }])[meta["features"]]

    model = xgb_model if data["model"] == "xgb" else rf_model
    prediction = int(model.predict(input_df)[0])
    proba = model.predict_proba(input_df)[0].tolist()

    return jsonify({
        "prediction": prediction,
        "label": "Likely to Leave" if prediction == 1 else "Likely to Stay",
        "risk_score": round(proba[1] * 100, 1),
        "confidence": round(max(proba) * 100, 1)
    })


if __name__ == "__main__":
    app.run(debug=False, host="127.0.0.1", port=5000)
