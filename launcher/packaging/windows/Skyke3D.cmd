@echo off
rem Skyke3D - abre o launcher (.jar) com o Java instalado. Copyright (C) 2026 Noturno-Strange. SPDX-License-Identifier: GPL-3.0-only
setlocal
set "JAR=%~dp0skyke3d-launcher.jar"
set "JAVAW=javaw"
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\javaw.exe" set "JAVAW=%JAVA_HOME%\bin\javaw.exe"
if "%JAVAW%"=="javaw" (
  where javaw >nul 2>nul
  if errorlevel 1 goto nojava
)
start "" "%JAVAW%" -jar "%JAR%" %*
exit /b 0
:nojava
mshta "javascript:alert('O launcher do Skyke3D precisa do Java 11 ou mais novo.\n\nA pagina de download vai abrir: instale o Java (JRE) e abra o Skyke3D de novo.');close()" 2>nul
start "" "https://adoptium.net/temurin/releases/?os=windows&package=jre"
exit /b 1
