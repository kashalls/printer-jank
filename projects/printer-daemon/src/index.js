import * as dotenv from 'dotenv'
dotenv.config()

import Bluez from 'bluez'
import express from 'express'
import helmet from 'helmet'
import bodyParser from 'body-parser'
import Encoder from 'esc-pos-encoder'

const PrinterPin = process.env.PRINTER_PIN ?? '1234'
const WhitelistedPrinters = process?.env?.WHITELISTED_PRINTERS?.split(' ') ?? []

let printer = null;
const bluetooth = new Bluez()
bluetooth.on('device', async (address, properties) => {
    if (!WhitelistedPrinters.includes(address)) return;
    console.log(`Trying to connect to ${properties.Name} ${address}`)
    try {
        const device = await bluetooth.getDevice(address)
        if (!properties.Paired) await device.Pair()
        await device.ConnectProfile(Bluez.SerialProfile.uuid)
        console.log(`Connected to ${properties.Name} ${address}`)
    } catch (error) {
        console.log(`Error trying to connect to ${properties.Name} ${address}\n${error.message}`)
    }
})
bluetooth.on('error', async (error) => {
    console.log(error)
    console.log(JSON.stringify(error))
    const adapter = await bluetooth.getAdapter()
    await adapter.StartDiscovery()
    console.log('Looking for new devices')
})

const app = express()
app.disable('x-powered-by')
app.use(helmet())
app.use(bodyParser.urlencoded({
    extended: true
}))
app.use(bodyParser.json())

app.get('/', (req, res) => {
    return res.json({ hello: 'there' })
})

app.get('/status', (req, res) => {
    return res.json({ printer: Boolean(printer) })
})

app.post('/print', (req, res) => {
    if (!printer) return res.status(500).send({ error: 'printer is currently not available' })
    console.log(req.body)
    if (!req.body || (!req.body.text && !req.body.image)) return res.status(400).send({ error: 'must include image or text in post body' })
    queue.push(req.body)
    return res.status(204).send()
})


app.post('/site-print', (req, res) => {
    if (!printer) return res.status(500).json({ error: 'printer is currently not available' })
    if (!req.body) return res.status(400).json({ error: 'must have json body' })
    if (!req.body.ip || !req.body.message) return res.status(400).json({ error: 'missing body fields' })

    const now = new Date()
    const date = now.toLocaleDateString('en-US')
    const time = now.toLocaleTimeString('en-US')
    const encoder = new Encoder()
        .initialize()
        .size('normal')
        .bold(true)
        .text(req.body.ip)
        .bold(false)
        .text(` - ${date} ${time}`)
        .newline()
        .line(req.body.message)
        .newline()
        .cut()
        .encode()

    printer?.write(encoder)
    return res.status(200).send({ success: true })

})

app.use((req, res, next) => {
    return res.status(404).send("Looks like that doesn't exist.")
})

app.use((err, req, res, next) => {
    console.error(err.stack)
    return res.status(500).send('Looks like that doesn\'t work.')
})

app.listen(process.env.PORT, async () => {
    console.log('Started listening for requests')
    bluetooth.init()
        .then(async () => {
            await bluetooth.registerStaticKeyAgent(PrinterPin)
            await bluetooth.registerSerialProfile(async (device, socket) => {
                console.log('New serial connection debug')
                printer = socket
                const name = await device.Name()
                socket.on('error', (error) => {
                    console.log(`Socket Error: ${error}`)
                })
                socket.on('end', () => {
                    printer = null
                    console.log('Socket closed')
                })

            }, 'client')
            const adapter = await bluetooth.getAdapter()
            await adapter.StartDiscovery()
        })
        .catch(console.error)
    console.log('Looking for new devices 1')
})