-- ============================================================================
-- UKPDA & ILC Sales Dashboard: Sliding Window Session & Tab Tracker (Redis/Lua)
-- ============================================================================
-- Description:
--   Tracks active application tabs and browser sessions in real-time using Redis
--   Sorted Sets (ZSET). Automatically prunes stale/closed tabs using a sliding
--   time window and returns the exact active count across all browsers.
--
-- Keys:
--   KEYS[1] : Key for the sorted set (e.g. 'sales_dashboard:active_tabs')
--
-- Arguments:
--   ARGV[1] : Current timestamp in milliseconds (e.g. from Date.now() or redis.call('TIME'))
--   ARGV[2] : Sliding window timeout in milliseconds (e.g. 8000 for an 8s window)
--   ARGV[3] : Unique Tab / Session ID (e.g. 'tab_a8f92b')
--   ARGV[4] : Action ('heartbeat', 'close', 'count', 'prune')
--   ARGV[5] : Optional metadata JSON string (e.g. '{"user":"admin","role":"admin"}')
--
-- Returns:
--   Integer count of currently active tabs in the sliding window.
-- ============================================================================

local set_key   = KEYS[1]
local now       = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2]) or 8000
local tab_id    = ARGV[3]
local action    = ARGV[4] or 'heartbeat'
local metadata  = ARGV[5] or ''

-- 1. Sliding Window Pruning: Remove any tabs whose last heartbeat was before (now - window_ms)
local threshold = now - window_ms
redis.call('ZREMRANGEBYSCORE', set_key, '-inf', threshold)

-- 2. Execute Action
if action == 'heartbeat' then
    if tab_id and tab_id ~= '' then
        -- Add or refresh current tab's heartbeat score
        redis.call('ZADD', set_key, now, tab_id)
        -- Optionally store metadata hash if provided
        if metadata ~= '' then
            local meta_key = set_key .. ':meta:' .. tab_id
            redis.call('SETEX', meta_key, math.ceil(window_ms / 1000) * 2, metadata)
        end
    end
elseif action == 'close' then
    if tab_id and tab_id ~= '' then
        redis.call('ZREM', set_key, tab_id)
        redis.call('DEL', set_key .. ':meta:' .. tab_id)
    end
end

-- 3. Set expiration on the whole sorted set (twice the window) to avoid abandoned keys
redis.call('EXPIRE', set_key, math.ceil(window_ms / 1000) * 3)

-- 4. Return current active tab count
local active_count = redis.call('ZCARD', set_key)
return active_count
