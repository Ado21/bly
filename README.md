# Baileys - API de WhatsApp Web en Typescript/Javascript

### Nota Importante

Esta biblioteca fue originalmente un proyecto para **CS-2362 en la Universidad de Ashoka** y de ninguna manera está afiliada o respaldada por WhatsApp. Úsela bajo su propia discreción. No envíe spam a la gente con esto. Desaconsejamos cualquier uso de stalkerware, mensajería masiva o automatizada.

#### Aviso de Responsabilidad y Licencia
Baileys y sus mantenedores no se hacen responsables del mal uso de esta aplicación, como se establece en la [licencia MIT](https://github.com/WhiskeySockets/Baileys/blob/master/LICENSE).
Los mantenedores de Baileys no aprueban de ninguna manera el uso de esta aplicación en prácticas que violen los Términos de Servicio de WhatsApp. Los mantenedores de esta aplicación apelan a la responsabilidad personal de sus usuarios para que la utilicen de manera justa, tal como está previsto.
##

Baileys no requiere Selenium ni ningún otro navegador para interactuar con WhatsApp Web, lo hace directamente usando un **WebSocket**.
No ejecutar Selenium o Chromium le ahorra como **medio giga** de RAM :/
Baileys admite la interacción con las versiones multidispositivo y web de WhatsApp.
Gracias a [@pokearaujo](https://github.com/pokearaujo/multidevice) por escribir sus observaciones sobre el funcionamiento de WhatsApp Multi-Device. Además, gracias a [@Sigalor](https://github.com/sigalor/whatsapp-web-reveng) por escribir sus observaciones sobre el funcionamiento de WhatsApp Web y gracias a [@Rhymen](https://github.com/Rhymen/go-whatsapp/) por la implementación en __go__.

## Por favor, Lea

El repositorio original tuvo que ser eliminado por el autor original; ahora continuamos el desarrollo en este repositorio.
Este es el único repositorio oficial y es mantenido por la comunidad.
 **Únase al Discord [aquí](https://discord.gg/WeJM5FP9GG)**

## Ejemplo

Consulte y ejecute [example.ts](Example/example.ts) para ver un ejemplo de uso de la biblioteca.
El script cubre los casos de uso más comunes.
Para ejecutar el script de ejemplo, descargue o clone el repositorio y luego escriba lo siguiente en una terminal:
1. ``` cd ruta/a/Baileys ```
2. ``` yarn ```
3. ``` yarn example ```

## Instalación

Use la versión estable:
```
yarn add @whiskeysockets/baileys
```

Use la versión de vanguardia (sin garantía de estabilidad, pero con las últimas correcciones y características)
```
yarn add github:WhiskeySockets/Baileys
```

Luego importe su código usando:
``` ts
import makeWASocket from '@whiskeysockets/baileys'
```

## Pruebas Unitarias

PENDIENTE

## Conexión multidispositivo (recomendado)

WhatsApp proporciona una API multidispositivo que permite a Baileys autenticarse como un segundo cliente de WhatsApp escaneando un código QR con WhatsApp en su teléfono.

``` ts
import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'

async function connectToWhatsApp () {
    const sock = makeWASocket({
        // puede proporcionar configuración adicional aquí
        printQRInTerminal: true
    })
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('conexión cerrada debido a ', lastDisconnect.error, ', reconectando ', shouldReconnect)
            // reconectar si no se ha cerrado la sesión
            if(shouldReconnect) {
                connectToWhatsApp()
            }
        } else if(connection === 'open') {
            console.log('conexión abierta')
        }
    })
    sock.ev.on('messages.upsert', m => {
        console.log(JSON.stringify(m, undefined, 2))

        console.log('respondiendo a', m.messages[0].key.remoteJid)
        await sock.sendMessage(m.messages[0].key.remoteJid!, { text: '¡Hola!' })
    })
}
// ejecutar en el archivo principal
connectToWhatsApp()
```

Si la conexión es exitosa, verá un código QR impreso en la pantalla de su terminal, ¡escanéelo con WhatsApp en su teléfono y habrá iniciado sesión!

## Configuración de la Conexión

Puede configurar la conexión pasando un objeto `SocketConfig`.

La estructura completa de `SocketConfig` se menciona aquí con los valores predeterminados:
``` ts
type SocketConfig = {
    /** la URL de WS para conectarse a WA */
    waWebSocketUrl: string | URL
    /** Falla la conexión si el socket agota el tiempo de espera en este intervalo */
	connectTimeoutMs: number
    /** Tiempo de espera predeterminado para las consultas, indefinido para ningún tiempo de espera */
    defaultQueryTimeoutMs: number | undefined
    /** intervalo de ping-pong para la conexión WS */
    keepAliveIntervalMs: number
    /** agente proxy */
	agent?: Agent
    /** registrador pino */
	logger: Logger
    /** versión con la que conectarse */
    version: WAVersion
    /** anular la configuración del navegador */
	browser: WABrowserDescription
	/** agente utilizado para las solicitudes de recuperación -- carga/descarga de medios */
	fetchAgent?: Agent
    /** si el QR debe imprimirse en la terminal */
    printQRInTerminal: boolean
    /** si los eventos deben emitirse para las acciones realizadas por esta conexión de socket */
    emitOwnEvents: boolean
    /** proporcionar una caché para almacenar medios, para que no tengan que volver a cargarse */
    mediaCache?: NodeCache
    /** hosts de carga personalizados para cargar medios */
    customUploadHosts: MediaConnInfo['hosts']
    /** tiempo de espera entre el envío de nuevas solicitudes de reintento */
    retryRequestDelayMs: number
    /** número máximo de reintentos de mensajes */
    maxMsgRetryCount: number
    /** tiempo de espera para la generación del próximo QR en ms */
    qrTimeout?: number;
    /** proporcionar un objeto de estado de autenticación para mantener el estado de autenticación */
    auth: AuthenticationState
    /** gestionar el procesamiento del historial con este control; por defecto, sincronizará todo */
    shouldSyncHistoryMessage: (msg: proto.Message.IHistorySyncNotification) => boolean
    /** opciones de capacidad de transacción para SignalKeyStore */
    transactionOpts: TransactionCapabilityOptions
    /** proporcionar una caché para almacenar la lista de dispositivos de un usuario */
    userDevicesCache?: NodeCache
    /** marca al cliente como en línea cada vez que el socket se conecta con éxito */
    markOnlineOnConnect: boolean
    /**
     * mapa para almacenar los recuentos de reintentos de los mensajes fallidos;
     * se utiliza para determinar si se debe reintentar un mensaje o no */
    msgRetryCounterMap?: MessageRetryMap
    /** ancho para las imágenes de vista previa de enlaces */
    linkPreviewImageThumbnailWidth: number
    /** ¿Debería Baileys solicitar al teléfono el historial completo, se recibirá de forma asíncrona */
    syncFullHistory: boolean
    /** ¿Debería Baileys activar las consultas de inicio automáticamente, por defecto es verdadero */
    fireInitQueries: boolean
    /**
     * generar una vista previa de enlace de alta calidad,
     * implica cargar la miniatura jpeg a WA
     * */
    generateHighQualityLinkPreview: boolean

    /** opciones para axios */
    options: AxiosRequestConfig<any>
    /**
     * obtener un mensaje de su tienda
     * implemente esto para que los mensajes que no se pudieron enviar (resuelve el problema de "este mensaje puede tardar un poco") puedan reintentarse
     * */
    getMessage: (key: proto.IMessageKey) => Promise<proto.IMessage | undefined>
}
```

### Emulación de la aplicación de escritorio en lugar de la web

1. Baileys, por defecto, emula una sesión web de Chrome.
2. Si desea emular una conexión de escritorio (y recibir más historial de mensajes), agregue esto a su configuración de Socket:
    ``` ts
    const conn = makeWASocket({
        ...otherOpts,
        // también puede usar Windows, Ubuntu aquí
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: true
    })
    ```

## Guardado y Restauración de Sesiones

Obviamente, no desea seguir escaneando el código QR cada vez que quiera conectarse.

Por lo tanto, puede cargar las credenciales para volver a iniciar sesión:
``` ts
import makeWASocket, { BufferJSON, useMultiFileAuthState } from '@whiskeysockets/baileys'
import * as fs from 'fs'

// función de utilidad para ayudar a guardar el estado de autenticación en una sola carpeta
// esta función sirve como una buena guía para ayudar a escribir los estados de autenticación y clave para bases de datos SQL/no-SQL, que recomendaría en cualquier sistema de producción
const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
// utilizará el estado dado para conectarse
// por lo que si hay credenciales válidas disponibles, se conectará sin QR
const conn = makeWASocket({ auth: state })
// esto se llamará tan pronto como se actualicen las credenciales
conn.ev.on ('creds.update', saveCreds)
```

**Nota:** Cuando se recibe/envía un mensaje, debido a que las sesiones de señal necesitan actualizarse, las claves de autenticación (`authState.keys`) se actualizarán. Cada vez que eso suceda, debe guardar las claves actualizadas (se llama a `authState.keys.set()`). No hacerlo evitará que sus mensajes lleguen al destinatario y causará otras consecuencias inesperadas. La función `useMultiFileAuthState` se encarga automáticamente de eso, pero para cualquier otra implementación seria, deberá tener mucho cuidado con la gestión del estado de las claves.

## Escucha de Actualizaciones de Conexión

Baileys ahora dispara el evento `connection.update` para informarle que algo se ha actualizado en la conexión. Estos datos tienen la siguiente estructura:
``` ts
type ConnectionState = {
	/** la conexión ahora está abierta, conectándose o cerrada */
	connection: WAConnectionState
	/** el error que provocó el cierre de la conexión */
	lastDisconnect?: {
		error: Error
		date: Date
	}
	/** es este un nuevo inicio de sesión */
	isNewLogin?: boolean
	/** el código QR actual */
	qr?: string
	/** el dispositivo ha recibido todas las notificaciones pendientes mientras estaba desconectado */
	receivedPendingNotifications?: boolean
}
```

**Nota:** esto también ofrece cualquier actualización del QR.

## Manejo de Eventos

Baileys utiliza la sintaxis de EventEmitter para los eventos.
Todos están bien tipados, por lo que no debería tener problemas con un editor con Intellisense como VS Code.

Los eventos están tipados como se menciona aquí:

``` ts

export type BaileysEventMap = {
    /** el estado de la conexión se ha actualizado -- WS cerrado, abierto, conectando, etc. */
	'connection.update': Partial<ConnectionState>
    /** credenciales actualizadas -- algunos metadatos, claves o algo */
    'creds.update': Partial<AuthenticationCreds>
    /** sincronización del historial, todo está ordenado cronológicamente inverso */
    'messaging-history.set': {
        chats: Chat[]
        contacts: Contact[]
        messages: WAMessage[]
        isLatest: boolean
    }
    /** insertar o actualizar chats */
    'chats.upsert': Chat[]
    /** actualizar los chats dados */
    'chats.update': Partial<Chat>[]
    /** eliminar chats con el ID dado */
    'chats.delete': string[]
    'labels.association': LabelAssociation
    'labels.edit': Label
    /** la presencia de un contacto en un chat se actualizó */
    'presence.update': { id: string, presences: { [participant: string]: PresenceData } }

    'contacts.upsert': Contact[]
    'contacts.update': Partial<Contact>[]

    'messages.delete': { keys: WAMessageKey[] } | { jid: string, all: true }
    'messages.update': WAMessageUpdate[]
    'messages.media-update': { key: WAMessageKey, media?: { ciphertext: Uint8Array, iv: Uint8Array }, error?: Boom }[]
    /**
     * agregar/actualizar los mensajes dados. Si se recibieron mientras la conexión estaba en línea,
     * la actualización tendrá el tipo: "notify"
     *  */
    'messages.upsert': { messages: WAMessage[], type: MessageUpsertType }
    /** se reaccionó a un mensaje. Si se eliminó la reacción, "reaction.text" será falso */
    'messages.reaction': { key: WAMessageKey, reaction: proto.IReaction }[]

    'message-receipt.update': MessageUserReceiptUpdate[]

    'groups.upsert': GroupMetadata[]
    'groups.update': Partial<GroupMetadata>[]
    /** aplicar una acción a los participantes de un grupo */
    'group-participants.update': { id: string, participants: string[], action: ParticipantAction }

    'blocklist.set': { blocklist: string[] }
    'blocklist.update': { blocklist: string[], type: 'add' | 'remove' }
    /** Recibir una actualización de una llamada, incluyendo cuándo se recibió, rechazó o aceptó la llamada */
    'call': WACallEvent[]
}
```

Puede escuchar estos eventos de esta manera:
``` ts

const sock = makeWASocket()
sock.ev.on('messages.upsert', ({ messages }) => {
    console.log('recibí mensajes', messages)
})

```

## Implementación de un Almacén de Datos

Baileys no viene con un almacenamiento de facto para chats, contactos o mensajes. Sin embargo, se ha proporcionado una implementación simple en memoria. El almacén escucha las actualizaciones de chat, nuevos mensajes, actualizaciones de mensajes, etc., para tener siempre una versión actualizada de los datos.

Se puede usar de la siguiente manera:

``` ts
import makeWASocket, { makeInMemoryStore } from '@whiskeysockets/baileys'
// el almacén mantiene los datos de la conexión de WA en la memoria
// se puede escribir en un archivo y leer desde él
const store = makeInMemoryStore({ })
// se puede leer desde un archivo
store.readFromFile('./baileys_store.json')
// guarda el estado en un archivo cada 10 segundos
setInterval(() => {
    store.writeToFile('./baileys_store.json')
}, 10_000)

const sock = makeWASocket({ })
// escuchará desde este socket
// el almacén puede escuchar desde un nuevo socket una vez que el socket actual supere su vida útil
store.bind(sock.ev)

sock.ev.on('chats.upsert', () => {
    // puede usar "store.chats" como desee, incluso después de que el socket muera
    // "chats" => una instancia de KeyedDB
    console.log('recibí chats', store.chats.all())
})

sock.ev.on('contacts.upsert', () => {
    console.log('recibí contactos', Object.values(store.contacts))
})

```

El almacén también proporciona algunas funciones simples como `loadMessages` que utilizan el almacén para acelerar la recuperación de datos.

**Nota:** Recomiendo encarecidamente crear su propio almacén de datos, especialmente para conexiones MD, ya que almacenar todo el historial de chat de alguien en la memoria es un terrible desperdicio de RAM.

## Envío de Mensajes

**Envíe todo tipo de mensajes con una sola función:**

### Mensajes sin Medios

``` ts
import { MessageType, MessageOptions, Mimetype } from '@whiskeysockets/baileys'

const id = 'abcd@s.whatsapp.net' // el ID de WhatsApp
// ¡envíe un texto simple!
const sentMsg  = await sock.sendMessage(id, { text: 'oh hola' })
// envíe un mensaje de respuesta
const sentMsg  = await sock.sendMessage(id, { text: 'oh hola' }, { quoted: message })
// envíe un mensaje de menciones
const sentMsg  = await sock.sendMessage(id, { text: '@12345678901', mentions: ['12345678901@s.whatsapp.net'] })
// ¡envíe una ubicación!
const sentMsg  = await sock.sendMessage(
    id,
    { location: { degreesLatitude: 24.121231, degreesLongitude: 55.1121221 } }
)
// ¡envíe un contacto!
const vcard = 'BEGIN:VCARD\n' // metadatos de la tarjeta de contacto
            + 'VERSION:3.0\n'
            + 'FN:Jeff Singh\n' // nombre completo
            + 'ORG:Ashoka Uni;\n' // la organización del contacto
            + 'TEL;type=CELL;type=VOICE;waid=911234567890:+91 12345 67890\n' // ID de WhatsApp + número de teléfono
            + 'END:VCARD'
const sentMsg  = await sock.sendMessage(
    id,
    {
        contacts: {
            displayName: 'Jeff',
            contacts: [{ vcard }]
        }
    }
)

const reactionMessage = {
    react: {
        text: "💖", // use una cadena vacía para eliminar la reacción
        key: message.key
    }
}

const sendMsg = await sock.sendMessage(id, reactionMessage)
```

### Envío de mensajes con vistas previas de enlaces

1. Por defecto, WA MD no genera enlaces cuando se envía desde la web.
2. Baileys tiene una función para generar el contenido de estas vistas previas de enlaces.
3. Para habilitar el uso de esta función, agregue `link-preview-js` como dependencia a su proyecto con `yarn add link-preview-js`.
4. Envíe un enlace:
``` ts
// envíe un enlace
const sentMsg  = await sock.sendMessage(id, { text: 'Hola, esto fue enviado usando https://github.com/adiwajshing/baileys' })
```

### Mensajes con Medios

Enviar medios (video, stickers, imágenes) es más fácil y eficiente que nunca.
- Puede especificar un búfer, una URL local o incluso una URL remota.
- Al especificar una URL de medios, Baileys nunca carga todo el búfer en la memoria; incluso cifra los medios como un flujo legible.

``` ts
import { MessageType, MessageOptions, Mimetype } from '@whiskeysockets/baileys'
// Envío de gifs
await sock.sendMessage(
    id,
    {
        video: fs.readFileSync("Media/ma_gif.mp4"),
        caption: "¡hola!",
        gifPlayback: true
    }
)

await sock.sendMessage(
    id,
    {
        video: "./Media/ma_gif.mp4",
        caption: "¡hola!",
        gifPlayback: true,
	ptv: false // si se establece en verdadero, se enviará como una `nota de video`
    }
)

// envíe un archivo de audio
await sock.sendMessage(
    id,
    { audio: { url: "./Media/audio.mp3" }, mimetype: 'audio/mp4' }
    { url: "Media/audio.mp3" }, // puede enviar mp3, mp4 y ogg
)
```

### Notas

- `id` es el ID de WhatsApp de la persona o grupo al que le está enviando el mensaje.
    - Debe tener el formato ```[código de país][número de teléfono]@s.whatsapp.net```
	    - Ejemplo para personas: ```+19999999999@s.whatsapp.net```.
	    - Para grupos, debe tener el formato ``` 123456789-123345@g.us ```.
    - Para listas de difusión, es `[marca de tiempo de creación]@broadcast`.
    - Para historias, el ID es `status@broadcast`.
- Para mensajes con medios, la miniatura se puede generar automáticamente para imágenes y stickers siempre que agregue `jimp` o `sharp` como dependencia en su proyecto usando `yarn add jimp` o `yarn add sharp`. Las miniaturas para videos también se pueden generar automáticamente, aunque necesita tener `ffmpeg` instalado en su sistema.
- **MiscGenerationOptions**: información adicional sobre el mensaje. Puede tener los siguientes valores __opcionales__:
    ``` ts
    const info: MessageOptions = {
        quoted: quotedMessage, // el mensaje que desea citar
        contextInfo: { forwardingScore: 2, isForwarded: true }, // información de contexto aleatoria (también puede mostrar un mensaje reenviado con esto)
        timestamp: Date(), // opcional, si desea establecer manualmente la marca de tiempo del mensaje
        caption: "¡hola!", // (para mensajes con medios) el pie de foto para enviar con los medios (no se puede enviar con stickers)
        jpegThumbnail: "23GD#4/==", /*  (para mensajes de ubicación y medios) tiene que ser un JPEG codificado en base 64 si desea enviar una miniatura personalizada,
                                    o establecer en nulo si no desea enviar una miniatura.
                                    No ingrese este campo si desea generar una miniatura automáticamente
                                */
        mimetype: Mimetype.pdf, /* (para mensajes con medios) especifique el tipo de medio (opcional para todos los tipos de medios excepto documentos),
                                    import {Mimetype} from '@whiskeysockets/baileys'
                                */
        fileName: 'somefile.pdf', // (para mensajes con medios) nombre de archivo para los medios
        /* enviará mensajes de audio como notas de voz, si se establece en verdadero */
        ptt: true,
        /** ¿Debería enviarse como un mensaje que desaparece?
         * Por defecto 'chat', que sigue la configuración del chat */
        ephemeralExpiration: WA_DEFAULT_EPHEMERAL
    }
    ```
## Reenvío de Mensajes

``` ts
const msg = getMessageFromStore('455@s.whatsapp.net', 'HSJHJWH7323HSJSJ') // implemente esto en su lado
await sock.sendMessage('1234@s.whatsapp.net', { forward: msg }) // ¡WA reenvía el mensaje!
```

## Lectura de Mensajes

Un conjunto de claves de mensaje debe marcarse explícitamente como leído ahora.
En multidispositivo, no puede marcar un "chat" completo como leído como lo hacía con Baileys Web.
Esto significa que debe realizar un seguimiento de los mensajes no leídos.

``` ts
const key = {
    remoteJid: '1234-123@g.us',
    id: 'AHASHH123123AHGA', // id del mensaje que desea leer
    participant: '912121232@s.whatsapp.net' // el ID del usuario que envió el mensaje (indefinido para chats individuales)
}
// pasar a la función readMessages
// también puede pasar varias claves para leer varios mensajes
await sock.readMessages([key])
```

El ID del mensaje es el identificador único del mensaje que está marcando como leído.
En un `WAMessage`, se puede acceder al `messageID` usando ```messageID = message.key.id```.

## Actualización de Presencia

``` ts
await sock.sendPresenceUpdate('available', id)

```
Esto le permite a la persona/grupo con ``` id ``` saber si está en línea, desconectado, escribiendo, etc.

``` presence ``` puede ser uno de los siguientes:
``` ts
type WAPresence = 'unavailable' | 'available' | 'composing' | 'recording' | 'paused'
```

La presencia expira después de unos 10 segundos.

**Nota:** En la versión multidispositivo de WhatsApp, si un cliente de escritorio está activo, WA no envía notificaciones push al dispositivo. Si desea recibir dichas notificaciones, marque su cliente Baileys como desconectado usando `sock.sendPresenceUpdate('unavailable')`.

## Descarga de Mensajes con Medios

Si desea guardar los medios que recibió
``` ts
import { writeFile } from 'fs/promises'
import { downloadMediaMessage } from '@whiskeysockets/baileys'

sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0]

    if (!m.message) return // si no hay mensaje de texto o medios
    const messageType = Object.keys (m.message)[0]// obtener qué tipo de mensaje es -- texto, imagen, video
    // si el mensaje es una imagen
    if (messageType === 'imageMessage') {
        // descargar el mensaje
        const buffer = await downloadMediaMessage(
            m,
            'buffer',
            { },
            {
                logger,
                // pase esto para que baileys pueda solicitar una recarga de medios
                // que ha sido eliminado
                reuploadRequest: sock.updateMediaMessage
            }
        )
        // guardar en un archivo
        await writeFile('./my-download.jpeg', buffer)
    }
}
```

**Nota:** WhatsApp elimina automáticamente los medios antiguos de sus servidores. Para que el dispositivo acceda a dichos medios, se requiere una recarga por parte de otro dispositivo que los tenga. Esto se puede lograr usando:
``` ts
const updatedMediaMsg = await sock.updateMediaMessage(msg)
```

## Eliminación de Mensajes

``` ts
const jid = '1234@s.whatsapp.net' // también puede ser un grupo
const response = await sock.sendMessage(jid, { text: '¡hola!' }) // enviar un mensaje
// envía un mensaje para eliminar el mensaje dado
// esto elimina el mensaje para todos
await sock.sendMessage(jid, { delete: response.key })
```

**Nota:** la eliminación para uno mismo es compatible a través de `chatModify` (siguiente sección)

## Actualización de Mensajes

``` ts
const jid = '1234@s.whatsapp.net'

await sock.sendMessage(jid, {
      text: 'el texto actualizado va aquí',
      edit: response.key,
    });
```

## Modificación de Chats

WA utiliza una forma cifrada de comunicación para enviar actualizaciones de chat/aplicación. Esto se ha implementado en su mayoría y puede enviar las siguientes actualizaciones:

- Archivar un chat
  ``` ts
  const lastMsgInChat = await getLastMessageInChat('123456@s.whatsapp.net') // implemente esto en su lado
  await sock.chatModify({ archive: true, lastMessages: [lastMsgInChat] }, '123456@s.whatsapp.net')
  ```
- Silenciar/no silenciar un chat
  ``` ts
  // silenciar durante 8 horas
  await sock.chatModify({ mute: 8*60*60*1000 }, '123456@s.whatsapp.net', [])
  // no silenciar
  await sock.chatModify({ mute: null }, '123456@s.whatsapp.net', [])
  ```
- Marcar un chat como leído/no leído
  ``` ts
  const lastMsgInChat = await getLastMessageInChat('123456@s.whatsapp.net') // implemente esto en su lado
  // marcar como no leído
  await sock.chatModify({ markRead: false, lastMessages: [lastMsgInChat] }, '123456@s.whatsapp.net')
  ```

- Eliminar un mensaje para mí
  ``` ts
  await sock.chatModify(
    { clear: { messages: [{ id: 'ATWYHDNNWU81732J', fromMe: true, timestamp: "1654823909" }] } },
    '123456@s.whatsapp.net',
    []
    )

  ```

- Eliminar un chat
  ``` ts
  const lastMsgInChat = await getLastMessageInChat('123456@s.whatsapp.net') // implemente esto en su lado
  await sock.chatModify({
    delete: true,
    lastMessages: [{ key: lastMsgInChat.key, messageTimestamp: lastMsgInChat.messageTimestamp }]
  },
  '123456@s.whatsapp.net')
  ```

- Fijar/no fijar un chat
  ``` ts
  await sock.chatModify({
    pin: true // o `false` para no fijar
  },
  '123456@s.whatsapp.net')
  ```

- Destacar/no destacar un mensaje
  ``` ts
  await sock.chatModify({
  star: {
  	messages: [{ id: 'messageID', fromMe: true // o `false` }],
      	star: true // - true: Destacar Mensaje; false: No destacar Mensaje
  }},'123456@s.whatsapp.net');
  ```

**Nota:** si se equivoca en una de sus actualizaciones, WA puede cerrar su sesión en todos sus dispositivos y tendrá que volver a iniciar sesión.

## Mensajes que Desaparecen

``` ts
const jid = '1234@s.whatsapp.net' // también puede ser un grupo
// activar los mensajes que desaparecen
await sock.sendMessage(
    jid,
    // esto es 1 semana en segundos -- cuánto tiempo desea que aparezcan los mensajes
    { disappearingMessagesInChat: WA_DEFAULT_EPHEMERAL }
)
// se enviará como un mensaje que desaparece
await sock.sendMessage(jid, { text: 'hola' }, { ephemeralExpiration: WA_DEFAULT_EPHEMERAL })
// desactivar los mensajes que desaparecen
await sock.sendMessage(
    jid,
    { disappearingMessagesInChat: false }
)

```

## Varios

- Para verificar si un ID dado está en WhatsApp
    ``` ts
    const id = '123456'
    const [result] = await sock.onWhatsApp(id)
    if (result.exists) console.log (`${id} existe en WhatsApp, como jid: ${result.jid}`)
    ```
- Para consultar el historial de chat en un grupo o con alguien
    PENDIENTE, si es posible
- Para obtener el estado de alguna persona
    ``` ts
    const status = await sock.fetchStatus("xyz@s.whatsapp.net")
    console.log("estado: " + status)
    ```
- Para cambiar el estado de su perfil
    ``` ts
    const status = '¡Hola Mundo!'
    await sock.updateProfileStatus(status)
    ```
- Para cambiar su nombre de perfil
    ``` ts
    const name = 'Mi nombre'
    await sock.updateProfileName(name)
    ```
- Para obtener la foto de perfil de alguna persona/grupo
    ``` ts
    // para imagen de baja resolución
    const ppUrl = await sock.profilePictureUrl("xyz@g.us")
    console.log("descargar foto de perfil desde: " + ppUrl)
    // para imagen de alta resolución
    const ppUrl = await sock.profilePictureUrl("xyz@g.us", 'image')
    ```
- Para cambiar su foto de perfil o la de un grupo
    ``` ts
    const jid = '111234567890-1594482450@g.us' // también puede ser el suyo
    await sock.updateProfilePicture(jid, { url: './new-profile-picture.jpeg' })
    ```
- Para eliminar su foto de perfil o la de un grupo
    ``` ts
    const jid = '111234567890-1594482450@g.us' // también puede ser el suyo
    await sock.removeProfilePicture(jid)
    ```
- Para obtener la presencia de alguien (si está escribiendo o en línea)
    ``` ts
    // la actualización de presencia se obtiene y se llama aquí
    sock.ev.on('presence.update', json => console.log(json))
    // solicitar actualizaciones para un chat
    await sock.presenceSubscribe("xyz@s.whatsapp.net")
    ```
- Para bloquear o desbloquear a un usuario
    ``` ts
    await sock.updateBlockStatus("xyz@s.whatsapp.net", "block") // Bloquear usuario
    await sock.updateBlockStatus("xyz@s.whatsapp.net", "unblock") // Desbloquear usuario
    ```
- Para obtener un perfil de empresa, como la descripción o la categoría
    ```ts
    const profile = await sock.getBusinessProfile("xyz@s.whatsapp.net")
    console.log("descripción de la empresa: " + profile.description + ", categoría: " + profile.category)
    ```
Por supuesto, reemplace ``` xyz ``` con un ID real.

## Grupos
- Para crear un grupo
    ``` ts
    // título y participantes
    const group = await sock.groupCreate("Mi Grupo Fabuloso", ["1234@s.whatsapp.net", "4564@s.whatsapp.net"])
    console.log ("grupo creado con id: " + group.gid)
    sock.sendMessage(group.id, { text: 'hola a todos' }) // saludar a todos en el grupo
    ```
- Para agregar/eliminar personas de un grupo o degradar/promover personas
    ``` ts
    // id y personas para agregar al grupo (arrojará un error si falla)
    const response = await sock.groupParticipantsUpdate(
        "abcd-xyz@g.us",
        ["abcd@s.whatsapp.net", "efgh@s.whatsapp.net"],
        "add" // reemplace este parámetro con "remove", "demote" o "promote"
    )
    ```
- Para cambiar el asunto del grupo
    ``` ts
    await sock.groupUpdateSubject("abcd-xyz@g.us", "¡Nuevo Asunto!")
    ```
- Para cambiar la descripción del grupo
    ``` ts
    await sock.groupUpdateDescription("abcd-xyz@g.us", "¡Nueva Descripción!")
    ```
- Para cambiar la configuración del grupo
    ``` ts
    // solo permitir que los administradores envíen mensajes
    await sock.groupSettingUpdate("abcd-xyz@g.us", 'announcement')
    // permitir que todos envíen mensajes
    await sock.groupSettingUpdate("abcd-xyz@g.us", 'not_announcement')
    // permitir que todos modifiquen la configuración del grupo -- como la foto de perfil, etc.
    await sock.groupSettingUpdate("abcd-xyz@g.us", 'unlocked')
    // solo permitir que los administradores modifiquen la configuración del grupo
    await sock.groupSettingUpdate("abcd-xyz@g.us", 'locked')
    ```
- Para abandonar un grupo
    ``` ts
    await sock.groupLeave("abcd-xyz@g.us") // (arrojará un error si falla)
    ```
- Para obtener el código de invitación de un grupo
    ``` ts
    const code = await sock.groupInviteCode("abcd-xyz@g.us")
    console.log("código del grupo: " + code)
    ```
- Para revocar el código de invitación en un grupo
    ```ts
    const code = await sock.groupRevokeInvite("abcd-xyz@g.us")
    console.log("Nuevo código de grupo: " + code)
    ```
- Para consultar los metadatos de un grupo
    ``` ts
    const metadata = await sock.groupMetadata("abcd-xyz@g.us")
    console.log(metadata.id + ", título: " + metadata.subject + ", descripción: " + metadata.desc)
    ```
- Para unirse al grupo usando el código de invitación
    ``` ts
    const response = await sock.groupAcceptInvite("xxx")
    console.log("unido a: " + response)
    ```
    Por supuesto, reemplace ``` xxx ``` con el código de invitación.
- Para obtener información del grupo por código de invitación
    ```ts
    const response = await sock.groupGetInviteInfo("xxx")
    console.log("información del grupo: " + response)
    ```
- Para unirse al grupo usando groupInviteMessage
    ``` ts
    const response = await sock.groupAcceptInviteV4("abcd@s.whatsapp.net", groupInviteMessage)
    console.log("unido a: " + response)
    ```
  Por supuesto, reemplace ``` xxx ``` con el código de invitación.

- Para obtener la lista de solicitudes de unión
    ``` ts
    const response = await sock.groupRequestParticipantsList("abcd-xyz@g.us")
    console.log(response)
    ```
- Para aprobar/rechazar la solicitud de unión
    ``` ts
    const response = await sock.groupRequestParticipantsUpdate(
        "abcd-xyz@g.us", // id del grupo,
        ["abcd@s.whatsapp.net", "efgh@s.whatsapp.net"],
        "approve" // reemplace este parámetro con "reject"
    )
    console.log(response)
    ```

## Privacidad
- Para obtener la configuración de privacidad
    ``` ts
    const privacySettings = await sock.fetchPrivacySettings(true)
    console.log("configuración de privacidad: " + privacySettings)
    ```
- Para actualizar la privacidad de Última Vez
    ``` ts
    const value = 'all' // 'contacts' | 'contact_blacklist' | 'none'
    await sock.updateLastSeenPrivacy(value)
    ```
- Para actualizar la privacidad de En Línea
    ``` ts
    const value = 'all' // 'match_last_seen'
    await sock.updateOnlinePrivacy(value)
    ```
- Para actualizar la privacidad de la Foto de Perfil
    ``` ts
    const value = 'all' // 'contacts' | 'contact_blacklist' | 'none'
    await sock.updateProfilePicturePrivacy(value)
    ```
- Para actualizar la privacidad del Estado
    ``` ts
    const value = 'all' // 'contacts' | 'contact_blacklist' | 'none'
    await sock.updateStatusPrivacy(value)
    ```
- Para actualizar la privacidad de las Confirmaciones de Lectura
    ``` ts
    const value = 'all' // 'none'
    await sock.updateReadReceiptsPrivacy(value)
    ```
- Para actualizar la privacidad de Agregar a Grupos
    ``` ts
    const value = 'all' // 'contacts' | 'contact_blacklist'
    await sock.updateGroupsAddPrivacy(value)
    ```
- Para actualizar el Modo de Desaparición Predeterminado
    ``` ts
    const duration = 86400 // 604800 | 7776000 | 0
    await sock.updateDefaultDisappearingMode(duration)
    ```
## Listas de Difusión e Historias

Se pueden enviar mensajes a listas de difusión e historias.
necesita agregar las siguientes opciones de mensaje en sendMessage, así:
```ts
sock.sendMessage(jid, {image: {url: url}, caption: caption}, {backgroundColor : backgroundColor, font : font, statusJidList: statusJidList, broadcast : true})
```
- el cuerpo del mensaje puede ser un extendedTextMessage o imageMessage o videoMessage o voiceMessage
- Puede agregar backgroundColor y otras opciones en las opciones del mensaje
- broadcast: true habilita el modo de difusión
- statusJidList: una lista de personas que puede obtener que necesita proporcionar, que son las personas que recibirán este mensaje de estado.

- Puede enviar mensajes a listas de difusión de la misma manera que envía mensajes a grupos y chats individuales.
- En este momento, WA Web no admite la creación de listas de difusión, pero aún puede eliminarlas.
- Los ID de difusión tienen el formato `12345678@broadcast`
- Para consultar los destinatarios y el nombre de una lista de difusión:
    ``` ts
    const bList = await sock.getBroadcastListInfo("1234@broadcast")
    console.log (`nombre de la lista: ${bList.name}, recps: ${bList.recipients}`)
    ```

## Escritura de Funcionalidad Personalizada
Baileys está escrito con la funcionalidad personalizada en mente. En lugar de bifurcar el proyecto y reescribir los componentes internos, simplemente puede escribir sus propias extensiones.

Primero, habilite el registro de mensajes no manejados de WhatsApp configurando:
``` ts
const sock = makeWASocket({
    logger: P({ level: 'debug' }),
})
```
Esto le permitirá ver todo tipo de mensajes que WhatsApp envía en la consola.

Algunos ejemplos:

1. Funcionalidad para rastrear el porcentaje de batería de su teléfono.
    Habilita el registro y verá un mensaje sobre su batería en la consola:
    ```{"level":10,"fromMe":false,"frame":{"tag":"ib","attrs":{"from":"@s.whatsapp.net"},"content":[{"tag":"edge_routing","attrs":{},"content":[{"tag":"routing_info","attrs":{},"content":{"type":"Buffer","data":[8,2,8,5]}}]}]},"msg":"communication"} ```

   El "frame" es lo que se recibe del mensaje, tiene tres componentes:
   - `tag` -- de qué se trata este marco (por ejemplo, el mensaje tendrá "message")
   - `attrs` -- un par clave-valor de cadena con algunos metadatos (generalmente contiene el ID del mensaje)
   - `content` -- los datos reales (por ejemplo, un nodo de mensaje tendrá el contenido real del mensaje en él)
   - lea más sobre este formato [aquí](/src/WABinary/readme.md)

    Puede registrar una devolución de llamada para un evento usando lo siguiente:
    ``` ts
    // para cualquier mensaje con la etiqueta 'edge_routing'
    sock.ws.on(`CB:edge_routing`, (node: BinaryNode) => { })
    // para cualquier mensaje con la etiqueta 'edge_routing' y el atributo id = abcd
    sock.ws.on(`CB:edge_routing,id:abcd`, (node: BinaryNode) => { })
    // para cualquier mensaje con la etiqueta 'edge_routing', el atributo id = abcd y el primer nodo de contenido routing_info
    sock.ws.on(`CB:edge_routing,id:abcd,routing_info`, (node: BinaryNode) => { })
    ```
