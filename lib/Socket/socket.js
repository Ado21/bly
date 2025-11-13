"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
});
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeSocket = void 0;

const Boom = __importStar(require("@hapi/boom"));
const crypto_1 = require("crypto");
const url_1 = require("url");
const util_1 = require("util");
const WAProto = __importStar(require("../../WAProto/index.js"));
const Defaults = __importStar(require("../Defaults"));
const Types_1 = require("../Types");
const Utils = __importStar(require("../Utils"));
const WABinary = __importStar(require("../WABinary"));
const BinaryInfo_1 = require("../WAM/BinaryInfo.js");
const USyncQuery_1 = require("../WAUSync/");
const Client_1 = require("./Client");
const browser_utils_1 = require("../Utils/browser-utils.ts");

const { DisconnectReason } = Types_1;

/**
 * Connects to WA servers and performs:
 * - simple queries (no retry mechanism, wait for connection establishment)
 * - listen to messages and emit events
 * - query phone connection
 */
const makeSocket = (config) => {
    const {
        waWebSocketUrl,
        connectTimeoutMs,
        logger,
        keepAliveIntervalMs,
        browser,
        auth: authState,
        printQRInTerminal,
        defaultQueryTimeoutMs,
        transactionOpts,
        qrTimeout,
        makeSignalRepository
    } = config;

    const publicWAMBuffer = new BinaryInfo_1.BinaryInfo();

    const uqTagId = Utils.generateMdTagPrefix();
    let epoch = 1;
    const generateMessageTag = () => `${uqTagId}${epoch++}`;

    if (printQRInTerminal) {
        console.warn(
            'Warning: The printQRInTerminal option has been deprecated. You will no longer receive QR codes in the terminal automatically. Please listen to the connection.update event yourself and handle the QR your way. You can remove this message by removing this option. This message will be removed in a future version.'
        );
    }

    const url = typeof waWebSocketUrl === 'string' ? new url_1.URL(waWebSocketUrl) : waWebSocketUrl;

    if (config.mobile || url.protocol === 'tcp:') {
        throw new Boom.Boom('Mobile API is not supported anymore', { statusCode: DisconnectReason.loggedOut });
    }

    if (url.protocol === 'wss' && authState?.creds?.routingInfo) {
        url.searchParams.append('ED', authState.creds.routingInfo.toString('base64url'));
    }

    const ephemeralKeyPair = Utils.Curve.generateKeyPair();
    const noise = Utils.makeNoiseHandler({
        keyPair: ephemeralKeyPair,
        NOISE_HEADER: Defaults.NOISE_WA_HEADER,
        logger,
        routingInfo: authState?.creds?.routingInfo
    });

    const ws = new Client_1.WebSocketClient(url, config);
    ws.connect();

    const sendPromise = (0, util_1.promisify)(ws.send);
    const sendRawMessage = async (data) => {
        if (!ws.isOpen) {
            throw new Boom.Boom('Connection Closed', { statusCode: DisconnectReason.connectionClosed });
        }

        const bytes = noise.encodeFrame(data);
        await Utils.promiseTimeout(connectTimeoutMs, async (resolve, reject) => {
            try {
                await sendPromise.call(ws, bytes);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    };

    const sendNode = (frame) => {
        if (logger.level === 'trace') {
            logger.trace({ xml: WABinary.binaryNodeToString(frame), msg: 'xml send' });
        }

        const buff = WABinary.encodeBinaryNode(frame);
        return sendRawMessage(buff);
    };

    const waitForMessage = async (msgId, timeoutMs = defaultQueryTimeoutMs) => {
        let onRecv, onErr;
        try {
            const result = await Utils.promiseTimeout(timeoutMs, (resolve, reject) => {
                onRecv = (data) => resolve(data);
                onErr = (err) => {
                    reject(err || new Boom.Boom('Connection Closed', { statusCode: DisconnectReason.connectionClosed }));
                };

                ws.on(`TAG:${msgId}`, onRecv);
                ws.on('close', onErr);
                ws.on('error', onErr);

                return () => reject(new Boom.Boom('Query Cancelled'));
            });
            return result;
        } catch (error) {
            if (error instanceof Boom.Boom && error.output?.statusCode === DisconnectReason.timedOut) {
                logger?.warn?.({ msgId }, 'timed out waiting for message');
                return undefined;
            }
            throw error;
        } finally {
            if (onRecv) ws.off(`TAG:${msgId}`, onRecv);
            if (onErr) {
                ws.off('close', onErr);
                ws.off('error', onErr);
            }
        }
    };

    const query = async (node, timeoutMs) => {
        if (!node.attrs.id) {
            node.attrs.id = generateMessageTag();
        }

        const msgId = node.attrs.id;

        const result = await Utils.promiseTimeout(timeoutMs, async (resolve, reject) => {
            const resultPromise = waitForMessage(msgId, timeoutMs).catch(reject);
            sendNode(node)
                .then(async () => resolve(await resultPromise))
                .catch(reject);
        });

        if (result && 'tag' in result) {
            WABinary.assertNodeErrorFree(result);
        }

        return result;
    };

    const executeUSyncQuery = async (usyncQuery) => {
        if (usyncQuery.protocols.length === 0) {
            throw new Boom.Boom('USyncQuery must have at least one protocol');
        }

        const validUsers = usyncQuery.users;

        const userNodes = validUsers.map(user => ({
            tag: 'user',
            attrs: { jid: !user.phone ? user.id : undefined },
            content: usyncQuery.protocols.map(a => a.getUserElement(user)).filter(a => a !== null)
        }));

        const listNode = { tag: 'list', attrs: {}, content: userNodes };
        const queryNode = { tag: 'query', attrs: {}, content: usyncQuery.protocols.map(a => a.getQueryElement()) };

        const iq = {
            tag: 'iq',
            attrs: { to: WABinary.S_WHATSAPP_NET, type: 'get', xmlns: 'usync' },
            content: [{
                tag: 'usync',
                attrs: {
                    context: usyncQuery.context,
                    mode: usyncQuery.mode,
                    sid: generateMessageTag(),
                    last: 'true',
                    index: '0'
                },
                content: [queryNode, listNode]
            }]
        };

        const result = await query(iq);
        return usyncQuery.parseUSyncQueryResult(result);
    };

    const onWhatsApp = async (...phoneNumber) => {
        let usyncQuery = new USyncQuery_1.USyncQuery();
        let contactEnabled = false;

        for (const jid of phoneNumber) {
            if (WABinary.isLidUser(jid)) {
                logger?.warn('LIDs are not supported with onWhatsApp');
                continue;
            } else {
                if (!contactEnabled) {
                    contactEnabled = true;
                    usyncQuery = usyncQuery.withContactProtocol();
                }
                const phone = `+${jid.replace('+', '').split('@')[0]?.split(':')[0]}`;
                usyncQuery.withUser(new USyncQuery_1.USyncUser().withPhone(phone));
            }
        }

        if (usyncQuery.users.length === 0) return [];

        const results = await executeUSyncQuery(usyncQuery);
        if (results) {
            return results.list
                .filter(a => !!a.contact)
                .map(({ contact, id }) => ({ jid: id, exists: contact }));
        }
    };

    const pnFromLIDUSync = async (jids) => {
        const usyncQuery = new USyncQuery_1.USyncQuery().withLIDProtocol().withContext('background');

        for (const jid of jids) {
            if (WABinary.isLidUser(jid)) {
                logger?.warn('LID user found in LID fetch call');
                continue;
            } else {
                usyncQuery.withUser(new USyncQuery_1.USyncUser().withId(jid));
            }
        }

        if (usyncQuery.users.length === 0) return [];

        const results = await executeUSyncQuery(usyncQuery);
        if (results) {
            return results.list.filter(a => !!a.lid).map(({ lid, id }) => ({ pn: id, lid }));
        }
        return [];
    };

    const ev = Utils.makeEventBuffer(logger);
    const { creds } = authState;
    const keys = Utils.addTransactionCapability(authState.keys, logger, transactionOpts);
    const signalRepository = makeSignalRepository({ creds, keys }, logger, pnFromLIDUSync);

    let lastDateRecv;
    let keepAliveReq;
    let qrTimer;
    let closed = false;

    const onUnexpectedError = (err, msg) => {
        logger.error({ err }, `unexpected error in '${msg}'`);
        const message = (err && ((err.stack || err.message) || String(err))).toLowerCase();
        if (message.includes('bad mac') || (message.includes('mac') && message.includes('invalid'))) {
            uploadPreKeysToServerIfRequired(true).catch(e => logger.warn({ e }, 'failed to re-upload prekeys after bad mac'));
        }
        if (message.includes('429') || message.includes('rate limit')) {
            const wait = Math.min(30000, (config.backoffDelayMs || 5000));
            logger.info({ wait }, 'backing off due to rate limit');
            setTimeout(() => {}, wait);
        }
    };

    const awaitNextMessage = async (sendMsg) => {
        if (!ws.isOpen) {
            throw new Boom.Boom('Connection Closed', { statusCode: DisconnectReason.connectionClosed });
        }

        let onOpen, onClose;
        const result = Utils.promiseTimeout(connectTimeoutMs, (resolve, reject) => {
            onOpen = resolve;
            onClose = mapWebSocketError(reject);
            ws.on('frame', onOpen);
            ws.on('close', onClose);
            ws.on('error', onClose);
        }).finally(() => {
            ws.off('frame', onOpen);
            ws.off('close', onClose);
            ws.off('error', onClose);
        });

        if (sendMsg) sendRawMessage(sendMsg).catch(onClose);
        return result;
    };

    const validateConnection = async () => {
        let helloMsg = { clientHello: { ephemeral: ephemeralKeyPair.public } };
        helloMsg = WAProto.proto.HandshakeMessage.fromObject(helloMsg);

        logger.info({ browser, helloMsg }, 'connected to WA');

        const init = WAProto.proto.HandshakeMessage.encode(helloMsg).finish();
        const result = await awaitNextMessage(init);
        const handshake = WAProto.proto.HandshakeMessage.decode(result);

        logger.trace({ handshake }, 'handshake recv from WA');

        const keyEnc = await noise.processHandshake(handshake, creds.noiseKey);
        let node;

        if (!creds.me) {
            node = Utils.generateRegistrationNode(creds, config);
            logger.info({ node }, 'not logged in, attempting registration...');
        } else {
            node = Utils.generateLoginNode(creds.me.id, config);
            logger.info({ node }, 'logging in...');
        }

        const payloadEnc = noise.encrypt(WAProto.proto.ClientPayload.encode(node).finish());
        await sendRawMessage(
            WAProto.proto.HandshakeMessage.encode({
                clientFinish: { static: keyEnc, payload: payloadEnc }
            }).finish()
        );
        noise.finishInit();
        startKeepAliveRequest();
    };

    const getAvailablePreKeysOnServer = async () => {
        const result = await query({
            tag: 'iq',
            attrs: { id: generateMessageTag(), xmlns: 'encrypt', type: 'get', to: WABinary.S_WHATSAPP_NET },
            content: [{ tag: 'count', attrs: {} }]
        });
        const countChild = WABinary.getBinaryNodeChild(result, 'count');
        return +countChild.attrs.value;
    };

    let uploadPreKeysPromise = null;
    let lastUploadTime = 0;

    const uploadPreKeys = async (count = Defaults.MIN_PREKEY_COUNT, retryCount = 0) => {
        if (retryCount === 0) {
            const timeSinceLastUpload = Date.now() - lastUploadTime;
            if (timeSinceLastUpload < Defaults.MIN_UPLOAD_INTERVAL) {
                logger.debug(`Skipping upload, only ${timeSinceLastUpload}ms since last upload`);
                return;
            }
        }

        if (uploadPreKeysPromise) {
            logger.debug('Pre-key upload already in progress, waiting for completion');
            await uploadPreKeysPromise;
        }

        const uploadLogic = async () => {
            logger.info({ count, retryCount }, 'uploading pre-keys');

            const node = await keys.transaction(async () => {
                logger.debug({ requestedCount: count }, 'generating pre-keys with requested count');
                const { update, node } = await Utils.getNextPreKeysNode({ creds, keys }, count);
                ev.emit('creds.update', update);
                return node;
            }, creds?.me?.id || 'upload-pre-keys');

            try {
                await query(node);
                logger.info({ count }, 'uploaded pre-keys successfully');
                lastUploadTime = Date.now();
            } catch (uploadError) {
                logger.error({ uploadError: uploadError.toString(), count }, 'Failed to upload pre-keys to server');

                if (retryCount < 3) {
                    const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                    logger.info(`Retrying pre-key upload in ${backoffDelay}ms`);
                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                    return uploadPreKeys(count, retryCount + 1);
                }
                throw uploadError;
            }
        };

        uploadPreKeysPromise = Promise.race([
            uploadLogic(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Boom.Boom('Pre-key upload timeout', { statusCode: 408 })), Defaults.UPLOAD_TIMEOUT)
            )
        ]);

        try {
            await uploadPreKeysPromise;
        } finally {
            uploadPreKeysPromise = null;
        }
    };

    const verifyCurrentPreKeyExists = async () => {
        const currentPreKeyId = creds.nextPreKeyId - 1;
        if (currentPreKeyId <= 0) return { exists: false, currentPreKeyId: 0 };

        const preKeys = await keys.get('pre-key', [currentPreKeyId.toString()]);
        const exists = !!preKeys[currentPreKeyId.toString()];
        return { exists, currentPreKeyId };
    };

    const uploadPreKeysToServerIfRequired = async (force = false) => {
        try {
            let count = 0;
            const preKeyCount = await getAvailablePreKeysOnServer();
            if (preKeyCount === 0) count = Defaults.INITIAL_PREKEY_COUNT;
            else count = Defaults.MIN_PREKEY_COUNT;

            const { exists: currentPreKeyExists, currentPreKeyId } = await verifyCurrentPreKeyExists();

            logger.info(`${preKeyCount} pre-keys found on server`);
            logger.info(`Current prekey ID: ${currentPreKeyId}, exists in storage: ${currentPreKeyExists}`);

            const lowServerCount = preKeyCount <= count;
            const missingCurrentPreKey = !currentPreKeyExists && currentPreKeyId > 0;
            const shouldUpload = force || lowServerCount || missingCurrentPreKey;

            if (shouldUpload) {
                const reasons = [];
                if (lowServerCount) reasons.push(`server count low (${preKeyCount})`);
                if (missingCurrentPreKey) reasons.push(`current prekey ${currentPreKeyId} missing from storage`);
                logger.info(`Uploading PreKeys due to: ${reasons.join(', ')}`);
                await uploadPreKeys(count);
            } else {
                logger.info(`PreKey validation passed - Server: ${preKeyCount}, Current prekey ${currentPreKeyId} exists`);
            }
        } catch (error) {
            logger.error({ error }, 'Failed to check/upload pre-keys during initialization');
        }
    };

    const onMessageReceived = (data) => {
        noise.decodeFrame(data, frame => {
            lastDateRecv = new Date();
            let anyTriggered = false;

            anyTriggered = ws.emit('frame', frame);
            if (!(frame instanceof Uint8Array)) {
                const msgId = frame.attrs.id;

                if (logger.level === 'trace') {
                    logger.trace({ xml: WABinary.binaryNodeToString(frame), msg: 'recv xml' });
                }

                anyTriggered = ws.emit(`${Defaults.DEF_TAG_PREFIX}${msgId}`, frame) || anyTriggered;

                const l0 = frame.tag;
                const l1 = frame.attrs || {};
                const l2 = Array.isArray(frame.content) ? frame.content[0]?.tag : '';

                for (const key of Object.keys(l1)) {
                    anyTriggered = ws.emit(`${Defaults.DEF_CALLBACK_PREFIX}${l0},${key}:${l1[key]},${l2}`, frame) || anyTriggered;
                    anyTriggered = ws.emit(`${Defaults.DEF_CALLBACK_PREFIX}${l0},${key}:${l1[key]}`, frame) || anyTriggered;
                    anyTriggered = ws.emit(`${Defaults.DEF_CALLBACK_PREFIX}${l0},${key}`, frame) || anyTriggered;
                }

                anyTriggered = ws.emit(`${Defaults.DEF_CALLBACK_PREFIX}${l0},,${l2}`, frame) || anyTriggered;
                anyTriggered = ws.emit(`${Defaults.DEF_CALLBACK_PREFIX}${l0}`, frame) || anyTriggered;

                if (!anyTriggered && logger.level === 'debug') {
                    logger.debug({ unhandled: true, msgId, fromMe: false, frame }, 'communication recv');
                }
            }
        });
    };

    const end = (error) => {
        if (closed) {
            logger.trace({ trace: error?.stack }, 'connection already closed');
            return;
        }

        closed = true;
        logger.info({ trace: error?.stack }, error ? 'connection errored' : 'connection closed');

        clearInterval(keepAliveReq);
        clearTimeout(qrTimer);

        ws.removeAllListeners('close');
        ws.removeAllListeners('open');
        ws.removeAllListeners('message');

        if (!ws.isClosed && !ws.isClosing) {
            try { ws.close(); } catch {}
        }

        ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: { error, date: new Date() }
        });
        ev.removeAllListeners('connection.update');
    };

    const waitForSocketOpen = async () => {
        if (ws.isOpen) return;
        if (ws.isClosed || ws.isClosing) {
            throw new Boom.Boom('Connection Closed', { statusCode: DisconnectReason.connectionClosed });
        }

        let onOpen, onClose;
        await new Promise((resolve, reject) => {
            onOpen = () => resolve();
            onClose = mapWebSocketError(reject);
            ws.on('open', onOpen);
            ws.on('close', onClose);
            ws.on('error', onClose);
        }).finally(() => {
            ws.off('open', onOpen);
            ws.off('close', onClose);
            ws.off('error', onClose);
        });
    };

    const startKeepAliveRequest = () => {
        keepAliveReq = setInterval(() => {
            if (!lastDateRecv) lastDateRecv = new Date();
            const diff = Date.now() - lastDateRecv.getTime();

            if (diff > keepAliveIntervalMs + 5000) {
                end(new Boom.Boom('Connection was lost', { statusCode: DisconnectReason.connectionLost }));
            } else if (ws.isOpen) {
                query({
                    tag: 'iq',
                    attrs: { id: generateMessageTag(), to: WABinary.S_WHATSAPP_NET, type: 'get', xmlns: 'w:p' },
                    content: [{ tag: 'ping', attrs: {} }]
                }).catch(err => {
                    logger.error({ trace: err.stack }, 'error in sending keep alive');
                });
            } else {
                logger.warn('keep alive called when WS not open');
            }
        }, keepAliveIntervalMs);
    };

    const sendPassiveIq = (tag) =>
        query({
            tag: 'iq',
            attrs: { to: WABinary.S_WHATSAPP_NET, xmlns: 'passive', type: 'set' },
            content: [{ tag, attrs: {} }]
        });

    const logout = async (msg) => {
        const jid = authState.creds.me?.id;
        if (jid) {
            await sendNode({
                tag: 'iq',
                attrs: { to: WABinary.S_WHATSAPP_NET, type: 'set', id: generateMessageTag(), xmlns: 'md' },
                content: [{
                    tag: 'remove-companion-device',
                    attrs: { jid, reason: 'user_initiated' }
                }]
            });
        }
        end(new Boom.Boom(msg || 'Intentional Logout', { statusCode: DisconnectReason.loggedOut }));
    };

    const requestPairingCode = async (phoneNumber, customPairingCode) => {
        const pairingCode = customPairingCode ?? Utils.bytesToCrockford((0, crypto_1.randomBytes)(5));
        if (customPairingCode && customPairingCode.length !== 8) {
            throw new Error('Custom pairing code must be exactly 8 chars');
        }

        authState.creds.pairingCode = pairingCode;
        authState.creds.me = { id: WABinary.jidEncode(phoneNumber, 's.whatsapp.net'), name: '~' };
        ev.emit('creds.update', authState.creds);

        await sendNode({
            tag: 'iq',
            attrs: { to: WABinary.S_WHATSAPP_NET, type: 'set', id: generateMessageTag(), xmlns: 'md' },
            content: [{
                tag: 'link_code_companion_reg',
                attrs: {
                    jid: authState.creds.me.id,
                    stage: 'companion_hello',
                    should_show_push_notification: 'true'
                },
                content: [
                    { tag: 'link_code_pairing_wrapped_companion_ephemeral_pub', attrs: {}, content: await generatePairingKey() },
                    { tag: 'companion_server_auth_key_pub', attrs: {}, content: authState.creds.noiseKey.public },
                    { tag: 'companion_platform_id', attrs: {}, content: (0, browser_utils_1.getPlatformId)(browser[1]) },
                    { tag: 'companion_platform_display', attrs: {}, content: `${browser[1]} (${browser[0]})` },
                    { tag: 'link_code_pairing_nonce', attrs: {}, content: '0' }
                ]
            }]
        });

        return authState.creds.pairingCode;
    };

    async function generatePairingKey() {
        const salt = (0, crypto_1.randomBytes)(32);
        const randomIv = (0, crypto_1.randomBytes)(16);
        const key = await Utils.derivePairingCodeKey(authState.creds.pairingCode, salt);
        const ciphered = Utils.aesEncryptCTR(authState.creds.pairingEphemeralKeyPair.public, key, randomIv);
        return Buffer.concat([salt, randomIv, ciphered]);
    }

    const sendWAMBuffer = (wamBuffer) => {
        return query({
            tag: 'iq',
            attrs: { to: WABinary.S_WHATSAPP_NET, id: generateMessageTag(), xmlns: 'w:stats' },
            content: [{ tag: 'add', attrs: { t: Math.round(Date.now() / 1000) + '' }, content: wamBuffer }]
        });
    };

    ws.on('message', onMessageReceived);
    ws.on('open', async () => {
        try {
            await validateConnection();
        } catch (err) {
            logger.error({ err }, 'error in validating connection');
            end(err);
        }
    });
    ws.on('error', mapWebSocketError(end));
    ws.on('close', () => end(new Boom.Boom('Connection Terminated', { statusCode: DisconnectReason.connectionClosed })));
    ws.on('CB:xmlstreamend', () => end(new Boom.Boom('Connection Terminated by Server', { statusCode: DisconnectReason.connectionClosed })));

    ws.on('CB:iq,type:set,pair-device', async (stanza) => {
        const iq = { tag: 'iq', attrs: { to: WABinary.S_WHATSAPP_NET, type: 'result', id: stanza.attrs.id } };
        await sendNode(iq);

        const pairDeviceNode = WABinary.getBinaryNodeChild(stanza, 'pair-device');
        const refNodes = WABinary.getBinaryNodeChildren(pairDeviceNode, 'ref');
        const noiseKeyB64 = Buffer.from(creds.noiseKey.public).toString('base64');
        const identityKeyB64 = Buffer.from(creds.signedIdentityKey.public).toString('base64');
        const advB64 = creds.advSecretKey;

        let qrMs = qrTimeout || 60000;
        const genPairQR = () => {
            if (!ws.isOpen) return;

            const refNode = refNodes.shift();
            if (!refNode) {
                end(new Boom.Boom('QR refs attempts ended', { statusCode: DisconnectReason.timedOut }));
                return;
            }

            const ref = refNode.content.toString('utf-8');
            const qr = [ref, noiseKeyB64, identityKeyB64, advB64].join(',');
            ev.emit('connection.update', { qr });
            qrTimer = setTimeout(genPairQR, qrMs);
            qrMs = qrTimeout || 20000;
        };

        genPairQR();
    });

    ws.on('CB:iq,,pair-success', async (stanza) => {
        logger.debug('pair success recv');
        try {
            const { reply, creds: updatedCreds } = Utils.configureSuccessfulPairing(stanza, creds);
            logger.info({ me: updatedCreds.me, platform: updatedCreds.platform }, 'pairing configured successfully');
            ev.emit('creds.update', updatedCreds);
            ev.emit('connection.update', { isNewLogin: true, qr: undefined });
            await sendNode(reply);
        } catch (error) {
            logger.info({ trace: error.stack }, 'error in pairing');
            end(error);
        }
    });

    ws.on('CB:success', async (node) => {
        try {
            await uploadPreKeysToServerIfRequired();
            await sendPassiveIq('active');
        } catch (err) {
            logger.warn({ err }, 'failed to send initial passive iq');
        }

        logger.info('opened connection to WA');
        clearTimeout(qrTimer);

        ev.emit('creds.update', { me: { ...authState.creds.me, lid: node.attrs.lid } });
        ev.emit('connection.update', { connection: 'open' });

        if (node.attrs.lid && authState.creds.me?.id) {
            const myLID = node.attrs.lid;
            process.nextTick(async () => {
                try {
                    const myPN = authState.creds.me.id;
                    await signalRepository.lidMapping.storeLIDPNMappings([{ lid: myLID, pn: myPN }]);

                    const { user, device } = WABinary.jidDecode(myPN);
                    await authState.keys.set({
                        'device-list': { [user]: [device?.toString() || '0'] }
                    });

                    await signalRepository.migrateSession(myPN, myLID);
                    logger.info({ myPN, myLID }, 'Own LID session created successfully');
                } catch (error) {
                    logger.error({ error, lid: myLID }, 'Failed to create own LID session');
                }
            });
        }
    });

    ws.on('CB:stream:error', (node) => {
        logger.error({ node }, 'stream errored out');
        const { reason, statusCode } = Utils.getErrorCodeFromStreamError(node);
        end(new Boom.Boom(`Stream Errored (${reason})`, { statusCode, data: node }));
    });

    ws.on('CB:failure', (node) => {
        const reason = +(node.attrs.reason || 500);
        end(new Boom.Boom('Connection Failure', { statusCode: reason, data: node.attrs }));
    });

    ws.on('CB:ib,,downgrade_webclient', () => {
        end(new Boom.Boom('Multi-device beta not joined', { statusCode: DisconnectReason.multideviceMismatch }));
    });

    ws.on('CB:ib,,offline_preview', (node) => {
        logger.info('offline preview received', JSON.stringify(node));
        sendNode({ tag: 'ib', attrs: {}, content: [{ tag: 'offline_batch', attrs: { count: '100' } }] });
    });

    ws.on('CB:ib,,edge_routing', (node) => {
        const edgeRoutingNode = WABinary.getBinaryNodeChild(node, 'edge_routing');
        const routingInfo = WABinary.getBinaryNodeChild(edgeRoutingNode, 'routing_info');
        if (routingInfo?.content) {
            authState.creds.routingInfo = Buffer.from(routingInfo.content);
            ev.emit('creds.update', authState.creds);
        }
    });

    let didStartBuffer = false;
    process.nextTick(() => {
        if (creds.me?.id) {
            ev.buffer();
            didStartBuffer = true;
        }
        ev.emit('connection.update', { connection: 'connecting', receivedPendingNotifications: false, qr: undefined });
    });

    ws.on('CB:ib,,offline', (node) => {
        const child = WABinary.getBinaryNodeChild(node, 'offline');
        const offlineNotifs = +(child?.attrs.count || 0);
        logger.info(`handled ${offlineNotifs} offline messages/notifications`);
        if (didStartBuffer) {
            ev.flush();
            logger.trace('flushed events for initial buffer');
        }
        ev.emit('connection.update', { receivedPendingNotifications: true });
    });

    ev.on('creds.update', update => {
        const name = update.me?.name;
        if (creds.me?.name !== name) {
            logger.debug({ name }, 'updated pushName');
            sendNode({ tag: 'presence', attrs: { name: name } }).catch(err => {
                logger.warn({ trace: err.stack }, 'error in sending presence update on name change');
            });
        }
        Object.assign(creds, update);
    });

    return {
        type: 'md',
        ws,
        ev,
        authState: { creds, keys },
        signalRepository,
        get user() { return authState.creds.me; },
        generateMessageTag,
        query,
        waitForMessage,
        waitForSocketOpen,
        sendRawMessage,
        sendNode,
        logout,
        end,
        onUnexpectedError,
        uploadPreKeys,
        uploadPreKeysToServerIfRequired,
        requestPairingCode,
        wamBuffer: publicWAMBuffer,
        waitForConnectionUpdate: Utils.bindWaitForConnectionUpdate(ev),
        sendWAMBuffer,
        executeUSyncQuery,
        onWhatsApp
    };
};
exports.makeSocket = makeSocket;

function mapWebSocketError(handler) {
    return (error) => {
        handler(new Boom.Boom(`WebSocket Error (${error?.message})`, { statusCode: Utils.getCodeFromWSError(error), data: error }));
    };
}