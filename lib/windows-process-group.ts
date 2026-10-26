import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Group } from './process-group.ts'

const windowsJobSource = String.raw`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class UltimateProcessGroup {
  private const uint CreateSuspended = 0x00000004;
  private const uint StartfUseStdHandles = 0x00000100;
  private const uint KillOnJobClose = 0x00002000;
  private const uint Infinite = 0xFFFFFFFF;
  private static IntPtr ownerJob = IntPtr.Zero;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct StartupInfo {
    public int cb;
    public string lpReserved;
    public string lpDesktop;
    public string lpTitle;
    public int dwX;
    public int dwY;
    public int dwXSize;
    public int dwYSize;
    public int dwXCountChars;
    public int dwYCountChars;
    public int dwFillAttribute;
    public uint dwFlags;
    public short wShowWindow;
    public short cbReserved2;
    public IntPtr lpReserved2;
    public IntPtr hStdInput;
    public IntPtr hStdOutput;
    public IntPtr hStdError;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct SecurityAttributes {
    public int length;
    public IntPtr securityDescriptor;
    [MarshalAs(UnmanagedType.Bool)]
    public bool inheritHandle;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct ProcessInformation {
    public IntPtr hProcess;
    public IntPtr hThread;
    public uint processId;
    public uint threadId;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct BasicLimitInformation {
    public long perProcessUserTimeLimit;
    public long perJobUserTimeLimit;
    public uint limitFlags;
    public UIntPtr minimumWorkingSetSize;
    public UIntPtr maximumWorkingSetSize;
    public uint activeProcessLimit;
    public UIntPtr affinity;
    public uint priorityClass;
    public uint schedulingClass;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct IoCounters {
    public ulong readOperationCount;
    public ulong writeOperationCount;
    public ulong otherOperationCount;
    public ulong readTransferCount;
    public ulong writeTransferCount;
    public ulong otherTransferCount;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct BasicAccountingInformation {
    public long totalUserTime;
    public long totalKernelTime;
    public long thisPeriodTotalUserTime;
    public long thisPeriodTotalKernelTime;
    public uint totalPageFaults;
    public uint totalProcesses;
    public uint activeProcesses;
    public uint totalTerminatedProcesses;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct ExtendedLimitInformation {
    public BasicLimitInformation basicLimitInformation;
    public IoCounters ioInfo;
    public UIntPtr processMemoryLimit;
    public UIntPtr jobMemoryLimit;
    public UIntPtr peakProcessMemoryUsed;
    public UIntPtr peakJobMemoryUsed;
  }

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern IntPtr OpenJobObject(uint access, bool inherit, string name);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CreateFileW")]
  private static extern IntPtr CreateFile(string name, uint access, uint share, ref SecurityAttributes attributes, uint creation, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimitInformation info, uint length);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CreateProcessW")]
  private static extern bool CreateProcess(string application, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string directory, ref StartupInfo startup, out ProcessInformation process);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool QueryInformationJobObject(IntPtr job, int infoClass, out BasicAccountingInformation info, uint length, IntPtr returnedLength);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool TerminateJobObject(IntPtr job, uint exitCode);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool TerminateProcess(IntPtr process, uint exitCode);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr GetStdHandle(int handle);

  private static void Check(bool result) {
    if (!result) throw new Win32Exception(Marshal.GetLastWin32Error());
  }

  private static string Quote(string value) {
    var result = new StringBuilder("\"");
    var slashes = 0;
    foreach (var character in value) {
      if (character == '\\') { slashes++; continue; }
      if (character == '\"') {
        result.Append('\\', slashes * 2 + 1).Append('\"');
        slashes = 0;
        continue;
      }
      result.Append('\\', slashes).Append(character);
      slashes = 0;
    }
    result.Append('\\', slashes * 2).Append('\"');
    return result.ToString();
  }

  private static void WaitEmpty(IntPtr job, uint timeout) {
    BasicAccountingInformation info;
    var elapsed = 0;
    do {
      Check(QueryInformationJobObject(job, 1, out info, (uint)Marshal.SizeOf(typeof(BasicAccountingInformation)), IntPtr.Zero));
      if (info.activeProcesses == 0) return;
      if (elapsed >= timeout) throw new TimeoutException("Windows job descendants did not exit");
      Thread.Sleep(10);
      elapsed += 10;
    } while (true);
  }

  public static bool Stop(string name, uint timeout) {
    var job = OpenJobObject(0x000C, false, name);
    if (job == IntPtr.Zero) {
      if (Marshal.GetLastWin32Error() == 2) return false;
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    try {
      Check(TerminateJobObject(job, 143));
      WaitEmpty(job, timeout);
      return true;
    } finally {
      CloseHandle(job);
    }
  }

  public static void Prepare(string name) {
    ownerJob = CreateJobObject(IntPtr.Zero, name);
    if (ownerJob == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    var limits = new ExtendedLimitInformation();
    limits.basicLimitInformation.limitFlags = KillOnJobClose;
    Check(SetInformationJobObject(ownerJob, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimitInformation))));
  }

  public static uint Run(string program, string[] arguments, string directory, uint timeout) {
    var job = ownerJob;
    if (job == IntPtr.Zero) throw new InvalidOperationException("The Windows job owner was not prepared");
    ProcessInformation process = new ProcessInformation();
    var startup = new StartupInfo();
    try {
      startup.cb = Marshal.SizeOf(typeof(StartupInfo));
      startup.dwFlags = StartfUseStdHandles;
      startup.hStdOutput = GetStdHandle(-11);
      startup.hStdError = GetStdHandle(-12);
      var nullAttributes = new SecurityAttributes();
      nullAttributes.length = Marshal.SizeOf(typeof(SecurityAttributes));
      nullAttributes.inheritHandle = true;
      startup.hStdInput = CreateFile("NUL", 0x80000000, 3, ref nullAttributes, 3, 0x80, IntPtr.Zero);
      if (startup.hStdInput == new IntPtr(-1)) {
        startup.hStdInput = IntPtr.Zero;
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      var commandLine = new StringBuilder(Quote(program));
      foreach (var argument in arguments) commandLine.Append(' ').Append(Quote(argument));
      Check(CreateProcess(null, commandLine, IntPtr.Zero, IntPtr.Zero, true, CreateSuspended, IntPtr.Zero, directory, ref startup, out process));
      CloseHandle(startup.hStdInput);
      startup.hStdInput = IntPtr.Zero;
      Check(AssignProcessToJobObject(job, process.hProcess));
      if (ResumeThread(process.hThread) == Infinite) throw new Win32Exception(Marshal.GetLastWin32Error());
      var control = new Thread(() => {
        var command = Console.In.ReadLine();
        if (command == null) TerminateJobObject(job, 1);
        else if (command == "STOP") TerminateJobObject(job, 143);
      });
      control.IsBackground = true;
      control.Start();
      if (WaitForSingleObject(process.hProcess, Infinite) != 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      uint exitCode;
      Check(GetExitCodeProcess(process.hProcess, out exitCode));
      TerminateJobObject(job, exitCode);
      WaitEmpty(job, timeout);
      return exitCode;
    } finally {
      if (startup.hStdInput != IntPtr.Zero) CloseHandle(startup.hStdInput);
      if (process.hProcess != IntPtr.Zero) {
        if (WaitForSingleObject(process.hProcess, 0) != 0) TerminateProcess(process.hProcess, 1);
        CloseHandle(process.hThread);
        CloseHandle(process.hProcess);
      }
      CloseHandle(job);
      ownerJob = IntPtr.Zero;
    }
  }
}`

function windowsPowerShell() {
  return join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  )
}

function windowsLauncher(
  program: string,
  args: string[],
  cwd: string,
  jobName: string,
  grace: number,
) {
  const payload = Buffer.from(JSON.stringify({ program, args, cwd, jobName, grace })).toString(
    'base64',
  )
  return [
    '$go = [Console]::In.ReadLine()',
    'if ($null -eq $go) { exit 1 }',
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    "$null = Add-Type -TypeDefinition @'",
    windowsJobSource,
    "'@",
    `$spec = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')))`,
    'try {',
    '  [UltimateProcessGroup]::Prepare([string]$spec.jobName)',
    '  $code = [UltimateProcessGroup]::Run([string]$spec.program, [string[]]$spec.args, [string]$spec.cwd, [uint32]$spec.grace)',
    '  exit [int]$code',
    '} catch {',
    '  [Console]::Error.WriteLine($_.ToString())',
    '  exit 1',
    '}',
  ].join('\n')
}

function windowsStopScript(jobName: string, timeout: number) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$null = Add-Type -TypeDefinition @'",
    windowsJobSource,
    "'@",
    `[Console]::Out.Write([UltimateProcessGroup]::Stop('${jobName}', ${timeout}))`,
  ].join('\n')
}

export function stopWindowsJob(jobName: string, timeout = 3000): boolean {
  const output = execFileSync(
    windowsPowerShell(),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(windowsStopScript(jobName, timeout), 'utf16le').toString('base64'),
    ],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim()
  return output === 'True'
}

export function identifyWindows(pid: number): string | undefined {
  const output = execFileSync(
    windowsPowerShell(),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$process = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($null -eq $process) { exit 0 }; [Console]::Out.Write($process.StartTime.ToUniversalTime().Ticks)`,
    ],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim()
  return /^\d+$/.test(output) ? output : undefined
}

/** Start a process under a Windows Job Object and wait for its descendants to be gone before exit. */
export function spawnWindowsGroup(
  program: string,
  args: string[],
  options: Omit<SpawnOptions, 'detached' | 'stdio'> & { grace?: number },
  pidFile?: string,
): Group {
  const { grace = 3000, ...rest } = options
  const jobName = `Local\\UltimateProcessGroup-${randomUUID()}`
  const child = spawn(
    windowsPowerShell(),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(
        windowsLauncher(program, args, String(options.cwd ?? process.cwd()), jobName, grace),
        'utf16le',
      ).toString('base64'),
    ],
    { ...rest, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
  )
  child.stdin.on('error', () => {
    // The launcher may have failed before it read the handshake; its exit reports the failure.
  })
  const ended = new Promise<boolean>((resolve) => {
    child.once('error', () => resolve(false))
    child.once('exit', () => resolve(true))
  })
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
  if (child.pid === undefined) return { child, ended, closed }
  let start: string | undefined
  try {
    if (pidFile) {
      start = identifyWindows(child.pid)
      if (!start) throw new Error(`Could not identify Windows process ${child.pid}`)
      writeFileSync(`${pidFile}.start`, `${start}\n`)
      writeFileSync(`${pidFile}.job`, `${jobName}\n`)
      writeFileSync(pidFile, `${child.pid}\n`)
    }
  } catch (error) {
    child.stdin.end()
    if (pidFile)
      for (const path of [pidFile, `${pidFile}.start`, `${pidFile}.job`])
        rmSync(path, { force: true })
    throw error
  }
  child.stdin.write('\n')
  return {
    child,
    ended,
    closed,
    stop: () => child.stdin.write('STOP\n'),
    force: () => stopWindowsJob(jobName, grace),
    ...(start ? { start } : {}),
  }
}
