@echo off
echo Installing dependencies...
pip install fastapi uvicorn numpy pandas
echo.
echo Starting corner detection server on http://localhost:8000
echo Press Ctrl+C to stop.
echo.
python server.py
pause
