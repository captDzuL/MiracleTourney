// Preparation state: independent owner-held recovery key escrow and output DACL
// evidence do not exist. A separate reviewed readiness change must replace this
// entry point before any production credential or data is handled.
process.stderr.write('PREPARATION_DISABLED\n');
process.exitCode = 1;
