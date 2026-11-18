# Verify a generated explorer

- Check the standalone page renders the root claim, opens nested steps, and
  typesets representative inline and display math. Follow the dependency
  and source links.
- When chat is requested, run `serve.py` and check the printed loopback URL.
  Use a synthetic question if validating model access without sending the
  user's proof. Check that a parent reply can be selected to open a child
  chat and that clicking its highlight after reload restores that chat.
- Run `build.py proof.json --output path/index.html --check` to confirm the
  output matches the current input and the installed template. Updating the
  proof changes the revision key for browser-local chats.
