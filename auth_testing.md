# Auth-Gated App Testing Playbook (Emergent Google Auth)

## Step 1: Create Test User & Session (via mongosh)

    mongosh --eval "
    use('test_database');
    var userId = 'test-user-' + Date.now();
    var sessionToken = 'test_session_' + Date.now();
    db.users.insertOne({
      user_id: userId,
      email: 'test.user.' + Date.now() + '@emergent.sh',
      name: 'Test User',
      picture: 'https://via.placeholder.com/150',
      created_at: new Date()
    });
    db.user_sessions.insertOne({
      user_id: userId,
      session_token: sessionToken,
      expires_at: new Date(Date.now() + 7*24*60*60*1000),
      created_at: new Date()
    });
    print('Session token: ' + sessionToken);
    print('User ID: ' + userId);
    "

For the Mobile Build Resolver: email MUST end with `@emergent.sh`, otherwise the domain
allowlist rejects the session on exchange.

## Step 2: Test Backend API

    # Auth check
    curl -X GET "$API/api/auth/me" -H "Authorization: Bearer YOUR_SESSION_TOKEN"

    # Protected endpoint
    curl -X POST "$API/api/diagnose" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
        -d '{"job_id":"41b30fe6-9d40-4818-b76f-df7bac4858e7"}'

## Step 3: Browser Testing (Playwright)

    await page.context.add_cookies([{
        "name": "session_token",
        "value": "YOUR_SESSION_TOKEN",
        "domain": "build-fixer-17.internal.preview.emergentagent.com",
        "path": "/",
        "httpOnly": True,
        "secure": True,
        "sameSite": "None",
    }])
    await page.goto("https://build-fixer-17.internal.preview.emergentagent.com/diagnose")

## Quick Debug

    # Data format
    mongosh --eval "
    use('test_database');
    db.users.find().limit(2).pretty();
    db.user_sessions.find().limit(2).pretty();
    "

    # Clean test data
    mongosh --eval "
    use('test_database');
    db.users.deleteMany({email: /test\\.user\\./});
    db.user_sessions.deleteMany({session_token: /test_session/});
    "

## Checklist

- User document has `user_id` field (custom UUID; MongoDB `_id` is separate/internal).
- Session `user_id` matches user's `user_id` exactly.
- All queries use `{"_id": 0}` projection.
- Backend uses `user_id`, never `_id` or `id`.
- Only `@emergent.sh` emails create sessions.
- `/api/auth/me` returns user data with a valid Bearer token or cookie.

## Success indicators

- ✅ `/api/auth/me` returns user data
- ✅ Protected endpoints (`/api/diagnose`, etc.) return their data
- ✅ Browser loads app (no redirect to `/login`)

## Failure indicators

- ❌ 401 Unauthorized (missing / expired / invalid token)
- ❌ 403 Forbidden with "Access is limited to @emergent.sh" (non-emergent email)
- ❌ Redirect to `/login` (front-end AuthProvider didn't find session)
