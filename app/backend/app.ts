import express from "express";
import { createClient } from "redis";
import { json } from "body-parser";
const { default: Redlock } = require("redlock");
let process_lock = {"account":false};

const DEFAULT_BALANCE = 100;

interface ChargeResult {
    isAuthorized: boolean;
    remainingBalance: number;
    charges: number;
}

async function connect(): Promise<ReturnType<typeof createClient>> {
    const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
    console.log(`Using redis URL ${url}`);
    const client = createClient({ url });
    await client.connect();
    return client;
}

const url = `redis://${process.env.REDIS_HOST ?? "localhost"}:${process.env.REDIS_PORT ?? "6379"}`;
const redisClient = createClient({ url });

const redlock = new Redlock(
    [redisClient],
    {
        driftFactor: 0.01,
        retryCount:  20,
        retryDelay:  2000,
        retryJitter:  200
    }
);

async function reset(account: string): Promise<void> {
    const client = await connect();
    try {
        await client.set(`${account}/balance`, DEFAULT_BALANCE);
    } finally {
        await client.disconnect();
    }
}

async function charge(account: string, charges: number): Promise<ChargeResult> {
    const client = await connect();
    try {
        var expireLimit = 5000;
        var lockExpireTime = Date.now() + expireLimit;
        var result = await client.setNX(account, lockExpireTime.toString());
        console.log("result:" + result);
        while(result == false) {
            await new Promise(r => setTimeout(r, 1));
            var expireTime =  parseInt((await client.get(account) ?? "0"));
            if (expireTime < Date.now()) {
                // This is required in case some process with lock dies before releasing the lock.
                var lockTime = await client.getSet(account, (Date.now() + expireLimit).toString());
                if(lockTime == null || parseInt(lockTime) < Date.now()) {
                    result = true;
                }
            } else {
                result = await client.setNX(account, "true");
            }
        }
        const balance = parseInt((await client.get(`${account}/balance`)) ?? "");
        if (balance >= charges) {
            await client.set(`${account}/balance`, balance - charges);
            const remainingBalance = parseInt((await client.get(`${account}/balance`)) ?? "");
            await client.DEL(account);
            return { isAuthorized: true, remainingBalance, charges };
        } else {
            await client.DEL(account);
            return { isAuthorized: false, remainingBalance: balance, charges: 0 };            
        }
        // Make sure any attempted lock extension has not failed.
    } finally {
        await client.disconnect();
    }
// });
}

export function buildApp(): express.Application {
    const app = express();
    app.use(json());
    app.post("/reset", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            await reset(account);
            console.log(`Successfully reset account ${account}`);
            res.sendStatus(204);
        } catch (e) {
            console.error("Error while resetting account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    app.post("/charge", async (req, res) => {
        try {
            const account = req.body.account ?? "account";
            const result = await charge(account, req.body.charges ?? 10);
            console.log(`Successfully charged account ${account}`);
            res.status(200).json(result);
        } catch (e) {
            console.error("Error while charging account", e);
            res.status(500).json({ error: String(e) });
        }
    });
    return app;
}
