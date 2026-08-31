@echo off
set "DEVECO_SDK_HOME=D:\DevEco Studio\sdk"
set "PATH=D:\DevEco Studio\tools\node;D:\DevEco Studio\tools\ohpm;D:\DevEco Studio\tools\hvigor\bin;%PATH%"
cd /d "D:\DevEcoProjects\ColorOfToday"
echo === ohpm install ===
call "D:\DevEco Studio\tools\ohpm\bin\ohpm.bat" install || goto :err
echo === hvigorw assembleHap ===
call "D:\DevEco Studio\tools\hvigor\bin\hvigorw.bat" --mode module -p module=entry@default assembleHap || goto :err
echo === BUILD OK ===
exit /b 0
:err
echo === BUILD FAILED ===
exit /b 1
