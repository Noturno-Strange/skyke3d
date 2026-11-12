; Skyke3D — instalador do launcher para Windows (NSIS). Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only
; Gerado por launcher/build.sh:  makensis -DVERSION=x.y.z -DSRC=<pasta com o .jar e o Skyke3D.exe> -DOUT=<arquivo.exe> [-DSIGNCMD=sign.sh] installer.nsi
; O atalho abre o Skyke3D.exe (skyke3d.c), que acha o Java e abre o .jar. Com -DSIGNCMD, o makensis assina o desinstalador
; (!uninstfinalize) e o instalador pronto (!finalize) com esse comando; sem certificado configurado ele não faz nada.
; Instala só para o usuário atual (sem pedir senha de administrador), em %LOCALAPPDATA%\Programs\Skyke3D Launcher, com atalhos no
; menu Iniciar e na área de trabalho e entrada em "Aplicativos instalados" para desinstalar. O launcher precisa do Java 11 ou mais
; novo: o instalador avisa quando não acha e oferece a página de download.
Unicode true
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef SRC
  !define SRC "..\..\build"
!endif
!ifndef OUT
  !define OUT "skyke3d-launcher-setup.exe"
!endif
!define APP "Skyke3D Launcher"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Skyke3DLauncher"
!define JAVA_URL "https://adoptium.net/temurin/releases/?os=windows&package=jre"

Name "${APP}"
!ifdef SIGNCMD
  !uninstfinalize '"${SIGNCMD}" "%1"' = 0
  !finalize '"${SIGNCMD}" "%1"' = 0
!endif
OutFile "${OUT}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Skyke3D Launcher"
InstallDirRegKey HKCU "${UNKEY}" "InstallLocation"
SetCompressor /SOLID lzma
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileDescription" "Instalador do launcher do Skyke3D"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright (C) 2026 Noturno-Strange (GPL-3.0-only)"

!define MUI_ICON "skyke3d.ico"
!define MUI_UNICON "skyke3d.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION RunApp
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o Skyke3D agora"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${SRC}\LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"
!insertmacro MUI_LANGUAGE "English"

Function RunApp
  Exec '"$INSTDIR\Skyke3D.exe"'
FunctionEnd

Section "Skyke3D Launcher" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  File "${SRC}\skyke3d-launcher.jar"
  File "/oname=LICENSE.txt" "${SRC}\LICENSE.txt"
  File "skyke3d.ico"
  File "${SRC}\Skyke3D.exe"
  Delete "$INSTDIR\Skyke3D.cmd" ; versões até a 1.2.0 abriam por um .cmd
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  ; atalhos: o Skyke3D.exe acha o Java e abre o .jar (sem janela de console e sem passar pelo cmd.exe)
  CreateDirectory "$SMPROGRAMS\Skyke3D"
  CreateShortcut "$SMPROGRAMS\Skyke3D\Skyke3D.lnk" "$INSTDIR\Skyke3D.exe" "" "$INSTDIR\Skyke3D.exe" 0 SW_SHOWNORMAL "" "Skyke3D: escolha o servidor e jogue"
  CreateShortcut "$SMPROGRAMS\Skyke3D\Desinstalar o Skyke3D Launcher.lnk" "$INSTDIR\Desinstalar.exe"
  CreateShortcut "$DESKTOP\Skyke3D.lnk" "$INSTDIR\Skyke3D.exe" "" "$INSTDIR\Skyke3D.exe" 0 SW_SHOWNORMAL "" "Skyke3D: escolha o servidor e jogue"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "Noturno-Strange"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\Skyke3D.exe"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "URLInfoAbout" "https://github.com/Noturno-Strange/skyke3d"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegStr HKCU "${UNKEY}" "QuietUninstallString" '"$INSTDIR\Desinstalar.exe" /S'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  ; sem Java o launcher não abre: avisa agora e oferece a página de download. Quem procura é o próprio Skyke3D.exe (JAVA_HOME,
  ; PATH, registro e pastas padrão dos instaladores do Java), e ele repete o aviso se a pessoa abrir sem instalar.
  IfSilent done
  ExecWait '"$INSTDIR\Skyke3D.exe" /skyke3d-java-check' $0
  StrCmp $0 "0" done
  MessageBox MB_YESNO|MB_ICONINFORMATION "O Skyke3D Launcher precisa do Java 11 ou mais novo, e não encontrei o Java neste computador.$\r$\n$\r$\nAbrir a página de download do Java (Temurin JRE) agora?" IDNO done
  ExecShell "open" "${JAVA_URL}"
  done:
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\Skyke3D\Skyke3D.lnk"
  Delete "$SMPROGRAMS\Skyke3D\Desinstalar o Skyke3D Launcher.lnk"
  RMDir "$SMPROGRAMS\Skyke3D"
  Delete "$DESKTOP\Skyke3D.lnk"
  Delete "$INSTDIR\skyke3d-launcher.jar"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\skyke3d.ico"
  Delete "$INSTDIR\Skyke3D.exe"
  Delete "$INSTDIR\Skyke3D.cmd"
  Delete "$INSTDIR\Desinstalar.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNKEY}"
  ; os ajustes do jogador (%APPDATA%\Skyke3D) ficam: é lá que está o perfil da janela própria, com a identidade dele
SectionEnd
