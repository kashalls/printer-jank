import * as dotenv from 'dotenv'
dotenv.config()

const PrinterPin = process.env.PRINTER_PIN ?? '1234'
const WhitelistedPrinters = process.env.WHITELISTED_PRINTERS.split(' ') ?? []
let available = false
const queue = []

import Bluez from 'bluez'
const bluetooth = new Bluez()
import express from 'express'
import bodyParser from 'body-parser'
import { Image } from 'canvas'
import Encoder from 'esc-pos-encoder'

const devicesSeen = [];

setInterval(() => {
    devicesSeen.forEach((device) => {
        if (device.lastSeen > Math.floor(Date.now() / 1000) + 1200) {
            delete devicesSeen[device]
        }
    })
})

bluetooth.on('device', async (address, properties) => {
    const seenBefore = devicesSeen.find((device) => {
        device.address === address
    })
    if (seenBefore) {
        devicesSeen[devicesSeen.findIndex((device) => device.address === address)].lastSeen = Math.floor(Date.now() / 1000)
    } else {
        devicesSeen.push({ address, lastSeen: Math.floor(Date.now() / 1000), name: properties.Name })
    }

    if (!WhitelistedPrinters.includes(address)) return;

    console.log(`Trying: ${address} - ${properties.name}`)

    const device = await bluetooth.getDevice(address);

    if (!properties.Paired) {
        try {
            await device.Pair()
        } catch (error) {
            console.error(`Error trying to pair to ${address} -> ${error.message}`)
        }
    }

    try {
        await device.ConnectProfile(Bluez.SerialProfile.uuid)
    } catch (error) {
        console.error(`Error while connecting to device ${address} -> ${error.message}`)
    }

    console.log(`Connected to ${address}`)
})

bluetooth.init()
    .then(async () => {
        console.log(`Creating agent with the pin ${PrinterPin}...`)
        await bluetooth.registerStaticKeyAgent(PrinterPin)
        console.log(`Created agent successfully`)

        await bluetooth.registerSerialProfile(async (device, socket) => {
            const name = await device.Name()
            console.log(`New serial connection from ${name}.`)
            available = true

            setInterval(async () => {
                if (!queue || queue.length <= 0) return;
                const print = queue.shift()
                const encoder = new Encoder()
                encoder.initialize()

                if (print.image) {
                    const awaitedImage = await new Promise((resolve, reject) => {
                        const img = new Image()
                        img.onload = () => resolve(img)
                        img.onerror = () => reject(new Error('Failed to load the provided image.'))
                        img.src = print.image
                    })
                    encoder.image(awaitedImage, 320, 320, 'threshold')
                }

                if (print.text) {
                    const stuff = print.text.split('\n')
                    stuff.forEach((item) => {
                        if (item.includes('\b')) {
                            encoder.bold(true)
                        }
                        encoder.line(item)
                        encoder.bold(false)
                        encoder.italic(false)
                        encoder.underline(false)
                        
                    })
                }
                const result = encoder.encode()
                socket.write(result)
                console.log('Complete')
            }, 3000)

            socket.pipe(process.stdout)

            socket.on('error', console.error)
            socket.on('end', () => {
                available = false
            })
        }, 'client')
        console.log(`Serial profile was registered.`)

        const adapter = await bluetooth.getAdapter()
        await adapter.StartDiscovery()
        console.log('Now watching the discovery channel /s')
    })
    .catch(console.error)

const app = express()
app.use(bodyParser.urlencoded({
    extended: true
  }))
  app.use(bodyParser.json())

app.get('/', (req, res) => {
    return res.send(app._router.stack
        .filter(r => r.route)
        .map(r => Object.keys(r.route.methods)[0].toUpperCase().padEnd(7) + r.route.path)
        .join("\n"))
})

app.get('/seen', (req, res) => {
    return res.send(JSON.stringify(devicesSeen))
})

app.get('/status', (req, res) => {
    return res.json({ available })
})

app.post('/print', (req, res) => {
    console.log(req.body)
    if (!req.body || (!req.body.text && !req.body.image)) return res.status(400).send({ error: 'must include image or text in post body'})
    queue.push(req.body)
    return res.status(204).send()
})

app.use((req, res) => {
    return res.status(404).send('Route not found.')
})

app.listen(process.env.PORT)