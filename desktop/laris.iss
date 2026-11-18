; Inno Setup script: one Laris-Setup.exe that installs for the current user (no admin rights),
; adds a desktop icon, and can start Laris when Windows starts. The shop's data is kept in
; %LOCALAPPDATA%\Laris and backups in Documents\Laris Cadangan, so uninstalling or updating
; never deletes them.
;   iscc /DAppVersion=0.2.0 desktop\laris.iss      (after pyinstaller has made dist\Laris)

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6B0C5B4E-3C1F-4C3B-9E9C-6C1A7D2B5A11}
AppName=Laris
AppVersion={#AppVersion}
VersionInfoVersion={#AppVersion}
AppPublisher=Laris
DefaultDirName={localappdata}\Programs\Laris
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=Laris-Setup-{#AppVersion}
SetupIconFile=laris.ico
UninstallDisplayIcon={app}\Laris.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Buat ikon Laris di desktop"
Name: "startup"; Description: "Nyalakan Laris otomatis setiap laptop dinyalakan"

[Files]
Source: "..\dist\Laris\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Laris"; Filename: "{app}\Laris.exe"
Name: "{autodesktop}\Laris"; Filename: "{app}\Laris.exe"; Tasks: desktopicon
Name: "{userstartup}\Laris"; Filename: "{app}\Laris.exe"; Parameters: "--minimized"; Tasks: startup

[Run]
Filename: "{app}\Laris.exe"; Description: "Buka Laris sekarang"; Flags: nowait postinstall skipifsilent
