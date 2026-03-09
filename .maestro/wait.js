// Busy-wait for ~1 second to let the XCTest accessibility tree recover
// after a takeScreenshot call (which briefly invalidates it on iOS).
var start = Date.now();
while (Date.now() - start < 1000) {}
