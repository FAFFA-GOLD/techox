' Double-click this if .bat windows close immediately.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
' /k keeps the console open even if the script errors early
sh.Run "cmd.exe /k title TECHOox Stable & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File """ & dir & "\start-ledger-stable.ps1""", 1, False
