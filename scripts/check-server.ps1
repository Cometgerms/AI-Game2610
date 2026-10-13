$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$toolRoot = Join-Path $env:LOCALAPPDATA 'Programs\CLion\bin'
$compiler = Join-Path $toolRoot 'mingw\bin\g++.exe'
$cmake = Join-Path $toolRoot 'cmake\win\x64\bin\cmake.exe'
$ctest = Join-Path $toolRoot 'cmake\win\x64\bin\ctest.exe'
$ninja = Join-Path $toolRoot 'ninja\win\x64\ninja.exe'
foreach ($tool in @($compiler, $cmake, $ctest, $ninja)) {
    if (!(Test-Path $tool)) { throw "Missing CLion tool: $tool. Use a C++20 toolchain with CMake instead." }
}
$env:PATH = (Split-Path $compiler -Parent) + ';' + $env:PATH
& $cmake -S . -B build -G Ninja "-DCMAKE_MAKE_PROGRAM=$ninja" "-DCMAKE_CXX_COMPILER=$compiler"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $cmake --build build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $ctest --test-dir build --output-on-failure
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& '.\build\sovereign_sim.exe'
exit $LASTEXITCODE
