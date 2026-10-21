@echo off
rem Builds release\index.html from src\ (needs Python 3). Use "build.cmd --check" to only test that it is up to date.
python "%~dp0build.py" %*
