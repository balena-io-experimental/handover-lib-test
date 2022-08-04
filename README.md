# handover example

This is a sample app that shows how to use the handover library.

You can test it by first deploying to a local device using `balena push` and then CTRL-C it so that it doesn't use `live push`.

Next, do a new `balena push`. The logs will show that the first instance of the application is not killed, but performs an ordered shutdown and triggers its own shutdown by creating `/tmp/resin-kill-me`.

