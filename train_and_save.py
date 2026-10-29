import numpy as np
import pandas as pd
import joblib
import json
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, precision_score, recall_score, f1_score
from xgboost import XGBClassifier

np.random.seed(42)
n = 1000

age = np.random.randint(21, 60, n)
monthly_income = np.random.randint(15000, 150000, n)
years_at_company = np.random.randint(0, 25, n)
job_satisfaction = np.random.randint(1, 5, n)
overtime = np.random.randint(0, 2, n)
distance_from_home = np.random.randint(1, 30, n)
num_promotions = np.random.randint(0, 5, n)
work_life_balance = np.random.randint(1, 5, n)
performance_rating = np.random.randint(1, 5, n)

score = (
    -0.06*age -0.00004*monthly_income -0.12*years_at_company
    -1.1*job_satisfaction +2.0*overtime +0.09*distance_from_home
    -0.5*num_promotions -0.9*work_life_balance -0.35*performance_rating
    + np.random.normal(0, 1.0, n)
)
prob = 1/(1+np.exp(-score))
attrition = (prob > np.median(prob)).astype(int)
flip = np.random.rand(n) < 0.04
attrition = np.where(flip, 1-attrition, attrition)

df = pd.DataFrame({
    "Age": age, "MonthlyIncome": monthly_income, "YearsAtCompany": years_at_company,
    "JobSatisfaction": job_satisfaction, "OverTime": overtime, "DistanceFromHome": distance_from_home,
    "NumPromotions": num_promotions, "WorkLifeBalance": work_life_balance,
    "PerformanceRating": performance_rating, "Attrition": attrition
})
df.to_csv("employee_attrition_data.csv", index=False)

X = df.drop("Attrition", axis=1)
y = df["Attrition"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

rf_model = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
rf_model.fit(X_train, y_train)
rf_preds = rf_model.predict(X_test)
rf_acc = accuracy_score(y_test, rf_preds)
rf_cm = confusion_matrix(y_test, rf_preds).tolist()

xgb_model = XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.1, eval_metric="logloss", random_state=42)
xgb_model.fit(X_train, y_train)
xgb_preds = xgb_model.predict(X_test)
xgb_acc = accuracy_score(y_test, xgb_preds)
xgb_cm = confusion_matrix(y_test, xgb_preds).tolist()

feature_names = list(X.columns)
rf_importance = dict(zip(feature_names, rf_model.feature_importances_.tolist()))
xgb_importance = dict(zip(feature_names, xgb_model.feature_importances_.tolist()))

joblib.dump(rf_model, "rf_model.pkl")
joblib.dump(xgb_model, "xgb_model.pkl")

metrics = {
    "features": feature_names,
    "rf": {
        "accuracy": rf_acc,
        "precision": precision_score(y_test, rf_preds),
        "recall": recall_score(y_test, rf_preds),
        "f1": f1_score(y_test, rf_preds),
        "confusion_matrix": rf_cm,
        "feature_importance": rf_importance
    },
    "xgb": {
        "accuracy": xgb_acc,
        "precision": precision_score(y_test, xgb_preds),
        "recall": recall_score(y_test, xgb_preds),
        "f1": f1_score(y_test, xgb_preds),
        "confusion_matrix": xgb_cm,
        "feature_importance": xgb_importance
    },
    "dataset_size": n,
    "train_size": len(X_train),
    "test_size": len(X_test)
}

with open("metrics.json", "w") as f:
    json.dump(metrics, f, indent=2)

joblib.dump({"features": feature_names}, "meta.pkl")

print(f"RF accuracy: {rf_acc*100:.2f}%")
print(f"XGB accuracy: {xgb_acc*100:.2f}%")
print("Saved: rf_model.pkl, xgb_model.pkl, meta.pkl, metrics.json, employee_attrition_data.csv")
