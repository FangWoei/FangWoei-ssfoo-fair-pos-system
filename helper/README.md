# Cash drawer helper

Windows laptop only. The MacBook takes QR and card, so it has no drawer.

**One file does everything.** `drawer-helper.js` contains the PowerShell it
needs and hands it to `powershell.exe` inline, base64-encoded. Nothing is
written to disk. If you still have `open-drawer.ps1` in this folder, delete it
— it is no longer used.

## Run it

1. Install Node.js from https://nodejs.org (the LTS build).
2. Double-click `start-drawer-helper.bat`.
3. Leave the window open all day. It logs a line every time the drawer opens,
   which is useful if the float doesn't balance at closing.

## Read the startup check

The window tells you whether it can work, before a cashier ever needs it:

```
BZU-BZU FAIR — cash drawer helper
  listening   http://localhost:9110

  powershell  reachable (powershell)
  printer     "Xprinter XP-370B" found

  TEST IT →   http://localhost:9110/test
```

Any line beginning `PROBLEM` is the fault. The printer check lists every
printer Windows has installed, so if the name is wrong you can see the correct
one and copy it into `PRINTER_NAME` near the top of `drawer-helper.js`.

The script itself is the same one you can paste into a PowerShell window by
hand — it is sent via `-EncodedCommand`, so there is no temp file, no quote
escaping, and script execution policy does not apply.

## Test without a sale

- http://localhost:9110/test — opens the drawer now, shows the result
- http://localhost:9110/health — is the helper alive?

## How it works

The drawer is wired into the RJ11 port on the printer, so opening it means
handing the printer a command.

The XP-370B speaks **TSPL**, which wants the literal text `CASHDRAWER 0,32,32`
delivered as a RAW spooler job. This is _not_ the ESC/POS pulse sequence
(`1B 70 00 20 20`) that most 80mm receipt printers use — the XP-370B ignores
those, which is why sharing the printer and copying raw bytes to it does
nothing.

Browsers cannot reach the print spooler, so the helper shells out to
PowerShell, which calls `winspool.drv` directly — `OpenPrinter`,
`StartDocPrinter` with datatype RAW, `WritePrinter`, and close.

## Speed

A kick takes a second or two, because PowerShell compiles the interop shim on
every call. This never delays a cashier: the till records the sale, clears the
cart and prints first, then asks for the drawer. The delay only affects how
long the app waits before warning that something went wrong.

## If it fails

The till shows a short note telling the cashier to use the drawer key and
carries on. **A sale is never held up by the drawer, and is recorded either
way.**

Worth checking in this order:

1. Is the helper window open? Start the .bat
2. Does the startup check report a `PROBLEM`?
   Restart the helper after any edit — it will not reload while running
3. Does http://localhost:9110/test work? If yes, the software is fine and the
   fault is physical
4. Is the RJ11 cable in the printer's **drawer** port, not its network port?
   They are the same shape and this catches people constantly
5. Does the drawer open with its key? Rule out a jam
