-- setnex.lua
local key = ARGV[1]
local balance = ARGV[2]
local reply = redis.call("GET", key)
local possible = false
if reply > balance then
    possible = true
    redis.call("SET", key, reply - balance)
end
return possible