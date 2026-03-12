import React, { useEffect, useState } from 'react'
import { fabric } from 'fabric'

/**
 * DomainImage
 * - domain: string (required) e.g. "alice.id"
 * - imagePath: string (optional) URL/path to background image (defaults to public/)
 * - alt: string (optional) alt text for the output <img/>
 *
 * Note: Make sure the background image is CORS-friendly or hosted same-origin
 * if you plan to call toDataURL() (otherwise the canvas will be tainted).
 */
export default function DomainImage({
  domain,
  imagePath = '/SafuBG.png',
  alt,
  className,
}: {
  domain: string
  imagePath?: string
  alt?: string
  className?: string
}): React.ReactElement | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!domain) {
      setDataUrl(null)
      return
    }

    let cancelled = false
    const offCanvas = document.createElement('canvas')
    const fCanvas = new fabric.StaticCanvas(offCanvas, {
      renderOnAddRemove: true,
      enableRetinaScaling: true,
    })

    // helper: ensure Gilroy CSS is present
    function ensureGilroyLink() {
      const href = 'https://fonts.cdnfonts.com/css/gilroy-bold'
      if (!document.querySelector(`link[href="${href}"]`)) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = href
        document.head.appendChild(link)
      }
    }

    // helper: wait for font to be usable
    async function waitForFont(fontFamily = 'Gilroy', timeoutMs = 3000) {
      // try using Font Loading API
      try {
        // request a specific descriptor; using weight 700 because it's Gilroy-Bold
        const descriptor = `700 16px "${fontFamily}"`
        // some browsers need fonts.ready first
        if (document.fonts && typeof document.fonts.load === 'function') {
          await Promise.race([
            document.fonts.load(descriptor) as Promise<FontFace[] | void>,
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error('font-timeout')), timeoutMs),
            ),
          ])
          // document.fonts.load resolves when available (or empty array)
          // also wait for fonts.ready so metrics are stable
          if (document.fonts.ready) await document.fonts.ready
          return true
        } else {
          // fallback: wait a bit for CSS to load
          await new Promise((res) => setTimeout(res, 400))
          return true
        }
      } catch (e) {
        console.warn('font load timeout/failure:', e)
        return false
      }
    }

    ; (async () => {
      ensureGilroyLink()
      // wait for Gilroy to load (font family name used by that stylesheet is "Gilroy")
      const fontLoaded = await waitForFont('Gilroy', 4000)

      // Now load the background image
      fabric.Image.fromURL(
        imagePath,
        (img: fabric.Image) => {
          if (cancelled) {
            try {
              fCanvas.dispose()
            } catch { }
            return
          }

          const W =
            img.width && img.height
              ? (img.width as number)
              : img.getScaledWidth()
          const H =
            img.height && img.width
              ? (img.height as number)
              : img.getScaledHeight()

          const width = W || 800
          const height = H || 400

          offCanvas.width = width
          offCanvas.height = height
          fCanvas.setWidth(width)
          fCanvas.setHeight(height)

          img.set({ originX: 'left', originY: 'top', left: 0, top: 0 })
          // set background image properly
          fCanvas.setBackgroundImage(img, fCanvas.renderAll.bind(fCanvas))

          // text layout
          const leftPadding = Math.round(width * 0.04)
          const rightPadding = leftPadding
          const maxTextWidth = width - leftPadding - rightPadding
          const bottomOffset = Math.round(height * 0.1)
          const maxHeightForText = Math.round(height * 0.35)

          let fontSize = Math.round(height * 0.12)
          const minFontSize = 8

          // choose font family: prefer Gilroy if loaded, else fallback
          const fontFamily = fontLoaded
            ? 'Gilroy, Inter, Arial, sans-serif'
            : 'Inter, Arial, sans-serif'
          const fontWeight = '700' // Gilroy-Bold

          const txt = new fabric.Text(domain, {
            left: leftPadding,
            top: height - bottomOffset - fontSize,
            fontSize,
            fontFamily,
            fill: '#FFB000',
            textAlign: 'left',
            selectable: false,
            evented: false,
            fontWeight,
            strokeWidth: 0,
          })

          fCanvas.add(txt)
          fCanvas.renderAll()

          let loops = 0
          while (
            (txt.width! > maxTextWidth || txt.height! > maxHeightForText) &&
            fontSize > minFontSize &&
            loops < 200
          ) {
            fontSize = fontSize - 1
            txt.set({ fontSize })
            txt.set({ top: height - bottomOffset - fontSize })
            txt.setCoords()
            fCanvas.renderAll()
            loops++
          }

          if (fontSize <= minFontSize && txt.width! > maxTextWidth) {
            let s = domain
            const dotIndex = s.lastIndexOf('.')
            const ext = dotIndex > 0 ? s.slice(dotIndex) : ''
            let leftPart = s.slice(0, Math.max(0, s.length - ext.length))
            let truncated = leftPart
            let candidate = truncated + ext
            txt.set({ text: candidate })
            fCanvas.renderAll()
            let truncLoops = 0
            while (
              txt?.width! > maxTextWidth &&
              truncated.length > 0 &&
              truncLoops < 500
            ) {
              truncated = truncated.slice(0, -1)
              candidate = truncated + '\u2026' + ext
              txt.set({ text: candidate })
              txt.setCoords()
              fCanvas.renderAll()
              truncLoops++
            }
          }

          txt.set({
            shadow: new fabric.Shadow({
              color: 'rgba(0,0,0,0.25)',
              blur: 4,
              offsetX: 1,
              offsetY: 1,
            }),
          })

          fCanvas.renderAll()

          // Export to PNG (may throw if canvas is tainted)
          try {
            const out = offCanvas.toDataURL('image/png')
            if (!cancelled) setDataUrl(out)
          } catch (e) {
            console.error('export failed (likely CORS/tainted canvas):', e)
            if (!cancelled) setDataUrl(null)
          }
        },
        // options (third arg) -- set crossOrigin here
        { crossOrigin: 'anonymous' },
      )
    })()

    return () => {
      cancelled = true
      try {
        fCanvas.dispose()
      } catch { }
    }
  }, [domain, imagePath])

  if (!dataUrl) return null
  return (
    <img
      className={className}
      src={dataUrl}
      alt={alt || domain}
      style={{ display: 'block' }}
    />
  )
}
