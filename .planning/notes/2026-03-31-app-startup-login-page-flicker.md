---
date: "2026-03-31 00:00"
promoted: true
---

I've noticed that sometimes when the app starts it displays the log in page, even though the token is still valid. After a force quit the app displays as normal. We should fix that, and also we shouldn't prevent people from using the app when the token is expired. Downloaded media will still work just fine. We should have an item on the left side of the root nav items (anything that's not hidden + the More tab) that let's people open the log in screen to refresh their token when we detect that the token is expired
