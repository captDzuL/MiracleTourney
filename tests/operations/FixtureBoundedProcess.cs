using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;

public sealed class FixtureBoundedResult {
    public string Output { get; set; }
    public string ErrorOutput { get; set; }
    public int ExitCode { get; set; }
}

public static class FixtureBoundedProcess {
    private static async Task<string> Capture(StreamReader reader, int cap) {
        var buffer = new char[4096];
        var result = new StringBuilder();
        while (true) {
            int count = await reader.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false);
            if (count == 0) return result.ToString();
            if (result.Length + count > cap) throw new InvalidOperationException("FIXTURE_CHILD_OUTPUT_LIMIT");
            result.Append(buffer, 0, count);
        }
    }

    public static void WaitForDrain(Task outputTask, Task errorTask, int drainMs) {
        if (!Task.WhenAll(outputTask, errorTask).Wait(drainMs))
            throw new TimeoutException("FIXTURE_CHILD_DRAIN_TIMEOUT");
    }

    public static FixtureBoundedResult Run(ProcessStartInfo info, int timeoutMs, int drainMs, int outputCap, int errorCap) {
        info.UseShellExecute = false;
        info.RedirectStandardInput = true;
        info.RedirectStandardOutput = true;
        info.RedirectStandardError = true;
        using (var process = new Process()) {
            process.StartInfo = info;
            bool started = false;
            try {
                if (!process.Start()) throw new InvalidOperationException("FIXTURE_CHILD_START_FAILED");
                started = true;
                process.StandardInput.Close();
                var outputTask = Capture(process.StandardOutput, outputCap);
                var errorTask = Capture(process.StandardError, errorCap);
                var watch = Stopwatch.StartNew();
                while (!process.WaitForExit(25)) {
                    if (outputTask.IsFaulted) outputTask.GetAwaiter().GetResult();
                    if (errorTask.IsFaulted) errorTask.GetAwaiter().GetResult();
                    if (watch.ElapsedMilliseconds >= timeoutMs) throw new TimeoutException("FIXTURE_CHILD_EXIT_TIMEOUT");
                }
                if (outputTask.IsFaulted) outputTask.GetAwaiter().GetResult();
                if (errorTask.IsFaulted) errorTask.GetAwaiter().GetResult();
                WaitForDrain(outputTask, errorTask, drainMs);
                if (process.ExitCode != 0) throw new InvalidOperationException("FIXTURE_CHILD_EXIT_FAILED");
                return new FixtureBoundedResult {
                    Output = outputTask.GetAwaiter().GetResult(),
                    ErrorOutput = errorTask.GetAwaiter().GetResult(),
                    ExitCode = process.ExitCode
                };
            } finally {
                if (started) {
                    try { if (!process.HasExited) process.Kill(); } catch (InvalidOperationException) { }
                    process.StandardOutput.Dispose();
                    process.StandardError.Dispose();
                    try { if (!process.HasExited) process.WaitForExit(2000); } catch (InvalidOperationException) { }
                }
            }
        }
    }
}
