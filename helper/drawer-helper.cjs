/**
 * SS FOO — cash drawer helper. Windows laptop only.
 *
 *   node drawer-helper.js          (or double-click start-drawer-helper.bat)
 *
 * One file, no dependencies, nothing else to copy. The PowerShell that talks
 * to the printer is embedded below and handed to powershell.exe inline via
 * -EncodedCommand: no temp file to write, no quotes to escape, and script
 * execution policy never enters into it because there is no script file.
 *
 * How it works
 * ------------
 * The drawer is wired into the RJ11 port on the printer, so opening it means
 * handing the printer a command. The XP-370B speaks TSPL, which wants the
 * literal text CASHDRAWER 0,32,32 delivered as a RAW spooler job — not the
 * ESC/POS pulse bytes most receipt printers use. Browsers cannot reach the
 * spooler, so this helper shells out to PowerShell, which calls winspool.drv.
 *
 * Checks itself on startup and prints exactly what is wrong. Read this window.
 */

const http = require("http");
const { execFile } = require("child_process");

/* ─────────── the only setting ───────────
   Must match Windows Settings → Printers & scanners exactly, spaces and all.
   If it does not match, the startup check below lists every printer you have
   so you can copy the right name in. */
const PRINTER_NAME = "Xprinter XP-370B";
/* ──────────────────────────────────────── */

const PORT = 9110;
const TIMEOUT_MS = 8000;

const PS_FALLBACK =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
let psExe = "powershell";

/* The script, kept here so there is no second file to lose. Backticks are
   escaped for JavaScript; PowerShell sees `r`n as it should. */
const PS_SCRIPT = `
$PrinterName = "${PRINTER_NAME}"

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, DOCINFOA pDocInfo);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
}
'@

[byte[]]$cmd = [System.Text.Encoding]::ASCII.GetBytes("CASHDRAWER 0,32,32\`r\`n")

$h = [IntPtr]::Zero
if ([RawPrinter]::OpenPrinter($PrinterName, [ref]$h, [IntPtr]::Zero)) {
    $doc = New-Object RawPrinter+DOCINFOA
    $doc.pDocName  = "Open Cash Drawer"
    $doc.pDataType = "RAW"
    [RawPrinter]::StartDocPrinter($h, 1, $doc) | Out-Null
    [RawPrinter]::StartPagePrinter($h) | Out-Null
    $written = 0
    [RawPrinter]::WritePrinter($h, $cmd, $cmd.Length, [ref]$written) | Out-Null
    [RawPrinter]::EndPagePrinter($h) | Out-Null
    [RawPrinter]::EndDocPrinter($h) | Out-Null
    [RawPrinter]::ClosePrinter($h) | Out-Null
    Write-Host "SENT $written bytes"
    exit 0
} else {
    Write-Host "ERROR: Cannot open printer '$PrinterName'"
    exit 1
}
`;

/* PowerShell expects -EncodedCommand as base64 of UTF-16LE, which is what
   'utf16le' gives us. Passing the script this way means Node never has to
   quote it and PowerShell never has to parse quotes back out. */
const ENCODED = Buffer.from(PS_SCRIPT, "utf16le").toString("base64");

function runPs(args) {
  return new Promise((resolve, reject) => {
    execFile(
      psExe,
      args,
      { windowsHide: true, timeout: TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (err && err.code === "ENOENT" && psExe !== PS_FALLBACK) {
          psExe = PS_FALLBACK;
          return runPs(args).then(resolve, reject);
        }
        const out = String(stdout || "").trim();
        if (err || /^ERROR/m.test(out)) {
          reject(new Error(out || String(stderr || err.message).trim()));
        } else {
          resolve(out);
        }
      },
    );
  });
}

const kick = () =>
  runPs(["-NoProfile", "-NonInteractive", "-EncodedCommand", ENCODED]);

async function selfCheck() {
  console.log("");
  try {
    await runPs(["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"]);
    console.log(`  powershell  reachable (${psExe})`);
  } catch (e) {
    console.error(`  PROBLEM     cannot run PowerShell — ${e.message}`);
    return;
  }

  try {
    const names = await runPs([
      "-NoProfile",
      "-Command",
      '(Get-CimInstance Win32_Printer).Name -join "|"',
    ]);
    const list = names
      .split("|")
      .map((n) => n.trim())
      .filter(Boolean);
    if (list.includes(PRINTER_NAME)) {
      console.log(`  printer     "${PRINTER_NAME}" found`);
    } else {
      console.error(`  PROBLEM     no printer named exactly "${PRINTER_NAME}"`);
      console.error("              Windows reports these:");
      list.forEach((n) => console.error(`                - ${n}`));
      console.error(
        "              Put the right one in PRINTER_NAME, line 32.",
      );
    }
  } catch (e) {
    console.error(`  PROBLEM     could not list printers — ${e.message}`);
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

  if (req.method === "OPTIONS") return res.writeHead(204).end();

  if (req.url.startsWith("/health")) {
    return res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ ok: true, printer: PRINTER_NAME }));
  }

  // Open this in the browser to test without ringing up a sale.
  if (req.url.startsWith("/test")) {
    try {
      const out = await kick();
      return res
        .writeHead(200, { "Content-Type": "text/plain" })
        .end(`OK — drawer command sent.\n\n${out}`);
    } catch (e) {
      return res
        .writeHead(500, { "Content-Type": "text/plain" })
        .end(`FAILED\n\n${e.message}`);
    }
  }

  if (req.method !== "POST" || !req.url.startsWith("/drawer")) {
    return res.writeHead(404).end();
  }

  const at = new Date().toLocaleTimeString();
  try {
    const out = await kick();
    console.log(`${at}  drawer opened — ${out}`);
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end('{"ok":true}');
  } catch (e) {
    console.error(`${at}  drawer FAILED — ${e.message}`);
    res
      .writeHead(500, { "Content-Type": "application/json" })
      .end(JSON.stringify({ ok: false, error: e.message }));
  }
});

server.on("error", (e) => {
  console.error(
    e.code === "EADDRINUSE"
      ? `Port ${PORT} is busy — the helper is probably already running in another window.`
      : e,
  );
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", async () => {
  console.log("BZU-BZU FAIR — cash drawer helper");
  console.log(`  listening   http://localhost:${PORT}`);
  await selfCheck();
  console.log("");
  console.log(`  TEST IT →   http://localhost:${PORT}/test`);
  console.log("");
  console.log("Leave this window open all day. Ctrl+C to stop.");
});
