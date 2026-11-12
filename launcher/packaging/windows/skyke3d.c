/*
 * Skyke3D - abre o launcher (skyke3d-launcher.jar) com o Java instalado no Windows.
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Substitui o antigo Skyke3D.cmd: um .exe de verdade (com ícone, versão e que pode ser assinado), sem janela de console e
 * sem passar pelo cmd.exe. Procura o javaw.exe nesta ordem:
 *   1. %JAVA_HOME%\bin\javaw.exe
 *   2. o PATH
 *   3. o registro (HKLM/HKCU\SOFTWARE\JavaSoft\JRE ou JDK, versão atual → JavaHome), onde ficam os instaladores do Java
 *   4. as pastas padrão dos instaladores (Eclipse Adoptium, Java, Microsoft, Zulu, Amazon Corretto) em Program Files
 * Achou: abre "javaw -jar skyke3d-launcher.jar <argumentos>" e sai. Não achou: avisa e abre a página de download do Java.
 * Com o argumento /skyke3d-java-check só responde, sem abrir nada (o instalador usa): 0 = achou o Java, 2 = não achou.
 * Compilar (Linux): x86_64-w64-mingw32-gcc -municode -mwindows -O2 -s skyke3d.c skyke3d.res.o -o Skyke3D.exe
 */
#define WIN32_LEAN_AND_MEAN
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <shellapi.h>
#include <wchar.h>

#define JAR_NAME L"skyke3d-launcher.jar"
#define JAVA_URL L"https://adoptium.net/temurin/releases/?os=windows&package=jre"
#define TITLE L"Skyke3D"

static int exists(const wchar_t *p) {
  DWORD a = GetFileAttributesW(p);
  return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

/* <home>\bin\javaw.exe, se existir */
static int fromHome(const wchar_t *home, wchar_t *out, size_t n) {
  if (!home || !*home) return 0;
  size_t l = wcslen(home);
  int r = _snwprintf(out, n, L"%ls%lsbin\\javaw.exe", home, (l && (home[l - 1] == L'\\' || home[l - 1] == L'/')) ? L"" : L"\\");
  return r > 0 && (size_t)r < n && exists(out);
}

/* HKxx\SOFTWARE\JavaSoft\<kind>: "CurrentVersion" → <kind>\<versão>\JavaHome */
static int fromRegistry(HKEY root, const wchar_t *kind, wchar_t *out, size_t n) {
  wchar_t key[256], ver[64], home[MAX_PATH];
  DWORD sz = sizeof(ver);
  _snwprintf(key, 256, L"SOFTWARE\\JavaSoft\\%ls", kind);
  if (RegGetValueW(root, key, L"CurrentVersion", RRF_RT_REG_SZ, NULL, ver, &sz) != ERROR_SUCCESS) return 0;
  _snwprintf(key, 256, L"SOFTWARE\\JavaSoft\\%ls\\%ls", kind, ver);
  sz = sizeof(home);
  if (RegGetValueW(root, key, L"JavaHome", RRF_RT_REG_SZ, NULL, home, &sz) != ERROR_SUCCESS) return 0;
  return fromHome(home, out, n);
}

/* <Program Files>\<vendor>\*\bin\javaw.exe: o primeiro que existir */
static int fromFolders(wchar_t *out, size_t n) {
  static const wchar_t *vendors[] = {L"Eclipse Adoptium", L"Java", L"Microsoft", L"Zulu", L"Amazon Corretto", L"BellSoft"};
  static const wchar_t *envs[] = {L"ProgramW6432", L"ProgramFiles", L"ProgramFiles(x86)"};
  wchar_t base[MAX_PATH], pat[MAX_PATH], home[MAX_PATH];
  for (int e = 0; e < 3; e++) {
    DWORD l = GetEnvironmentVariableW(envs[e], base, MAX_PATH);
    if (!l || l >= MAX_PATH) continue;
    for (int v = 0; v < (int)(sizeof(vendors) / sizeof(*vendors)); v++) {
      WIN32_FIND_DATAW fd;
      _snwprintf(pat, MAX_PATH, L"%ls\\%ls\\*", base, vendors[v]);
      HANDLE h = FindFirstFileW(pat, &fd);
      if (h == INVALID_HANDLE_VALUE) continue;
      do {
        if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) || fd.cFileName[0] == L'.') continue;
        _snwprintf(home, MAX_PATH, L"%ls\\%ls\\%ls", base, vendors[v], fd.cFileName);
        if (fromHome(home, out, n)) { FindClose(h); return 1; }
      } while (FindNextFileW(h, &fd));
      FindClose(h);
    }
  }
  return 0;
}

static int findJava(wchar_t *out, size_t n) {
  wchar_t env[MAX_PATH];
  DWORD l = GetEnvironmentVariableW(L"JAVA_HOME", env, MAX_PATH);
  if (l && l < MAX_PATH && fromHome(env, out, n)) return 1;
  if (SearchPathW(NULL, L"javaw.exe", NULL, (DWORD)n, out, NULL)) return 1;
  static const wchar_t *kinds[] = {L"JRE", L"JDK", L"Java Runtime Environment", L"Java Development Kit"};
  for (int k = 0; k < 4; k++)
    if (fromRegistry(HKEY_LOCAL_MACHINE, kinds[k], out, n) || fromRegistry(HKEY_CURRENT_USER, kinds[k], out, n)) return 1;
  return fromFolders(out, n);
}

/* os argumentos que vieram para este .exe, sem o nome dele (respeitando aspas) */
static const wchar_t *argsAfterProgram(const wchar_t *cl) {
  if (*cl == L'"') {
    cl++;
    while (*cl && *cl != L'"') cl++;
    if (*cl) cl++;
  } else
    while (*cl && *cl != L' ' && *cl != L'\t') cl++;
  while (*cl == L' ' || *cl == L'\t') cl++;
  return cl;
}

int WINAPI wWinMain(HINSTANCE hi, HINSTANCE hp, LPWSTR cmd, int show) {
  (void)hi; (void)hp; (void)cmd; (void)show;
  wchar_t self[MAX_PATH], jar[MAX_PATH], java[MAX_PATH];
  DWORD l = GetModuleFileNameW(NULL, self, MAX_PATH);
  if (!l || l >= MAX_PATH) return 1;
  wchar_t *slash = wcsrchr(self, L'\\');
  if (slash) slash[1] = 0;
  _snwprintf(jar, MAX_PATH, L"%ls%ls", self, JAR_NAME);
  if (!exists(jar)) {
    MessageBoxW(NULL, L"Não encontrei o arquivo skyke3d-launcher.jar ao lado deste programa.\n\nInstale o Skyke3D Launcher de novo.",
                TITLE, MB_OK | MB_ICONERROR);
    return 1;
  }
  const wchar_t *extra = argsAfterProgram(GetCommandLineW());
  // o instalador pergunta, sem abrir nada: 0 = achou o Java, 2 = não achou
  if (!wcscmp(extra, L"/skyke3d-java-check")) return findJava(java, MAX_PATH) ? 0 : 2;
  if (!findJava(java, MAX_PATH)) {
    MessageBoxW(NULL, L"O launcher do Skyke3D precisa do Java 11 ou mais novo, e não encontrei o Java neste computador.\n\n"
                      L"A página de download vai abrir: instale o Java (JRE) e abra o Skyke3D de novo.",
                TITLE, MB_OK | MB_ICONINFORMATION);
    ShellExecuteW(NULL, L"open", JAVA_URL, NULL, NULL, SW_SHOWNORMAL);
    return 1;
  }
  size_t cap = wcslen(java) + wcslen(jar) + wcslen(extra) + 32;
  wchar_t *line = (wchar_t *)HeapAlloc(GetProcessHeap(), 0, cap * sizeof(wchar_t));
  if (!line) return 1;
  _snwprintf(line, cap, L"\"%ls\" -jar \"%ls\"%ls%ls", java, jar, *extra ? L" " : L"", extra);
  STARTUPINFOW si;
  PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof(si));
  si.cb = sizeof(si);
  ZeroMemory(&pi, sizeof(pi));
  if (!CreateProcessW(java, line, NULL, NULL, FALSE, 0, NULL, self, &si, &pi)) {
    wchar_t msg[MAX_PATH + 160];
    _snwprintf(msg, MAX_PATH + 160, L"Não consegui abrir o Java em:\n%ls\n\nReinstale o Java (11 ou mais novo) e tente de novo.", java);
    MessageBoxW(NULL, msg, TITLE, MB_OK | MB_ICONERROR);
    return 1;
  }
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  return 0;
}
