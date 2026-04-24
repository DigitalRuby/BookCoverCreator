/* global jQuery, $ */

// --- Constants ---
const RENDER_DELAY_MS = 600;
const MAX_BITMAP_DIM = 4000;

function getDPI() { return window.state ? (window.state.params.dpi || 300) : 300; }

// --- State (Global) ---
const defaultParams = {
    width: 4065, height: 2775, spineWidth: 390,
    alphaMult: 2.0, alphaPower: 1.0, previewAlpha: 0.75,
    frontOffset: 0, backOffset: 0,
    frontZoom: 100, backZoom: 100,
    dpi: 300
};

let savedParams = localStorage.getItem('coverParams');
window.params = savedParams ? JSON.parse(savedParams) : $.extend({}, defaultParams);
if (typeof window.params.previewAlpha === 'undefined') window.params.previewAlpha = 0.75;
if (typeof window.params.dpi === 'undefined') window.params.dpi = 300;

// Overlays array
window.overlays = [];
window.selectedOverlayId = null;

window.state = {
    params: window.params,
    isCustomTemplate: false,
    images: { template: null, front: null, back: null, spine: null },
    bitmaps: { template: null, front: null, back: null, spine: null }
};

// --- CACHE & DOM ---
let spineCacheCanvas = document.createElement('canvas');
let offCanvas = document.createElement('canvas');
let isSpineCacheDirty = true;

const $dom = {
    width: $('#finalWidth'),
    height: $('#finalHeight'),
    spineW: $('#spineWidth'),
    dpi: $('#dpi'),
    aMult: $('#spineAlphaMultiplier'),
    aPower: $('#spineAlphaPower'),
    pAlpha: $('#previewAlpha'),
    pAlphaVal: $('#opacityVal'),
    outputDimensions: $('#outputDimensions'),
    canvas: $('#previewCanvas'),
    canvasWrapper: $('#canvas-wrapper'),
    spinner: $('#render-spinner'),
    frontOff: $('#frontOffset'),
    backOff: $('#backOffset'),
    frontZoom: $('#frontZoom'),
    backZoom: $('#backZoom'),
    mainArea: $('#main-area'),
    panelLayout: $('#panel-layout'),
    panelOverlay: $('#panel-overlay'),

    groups: {
        border: $('#group-border'),
        textBg: $('#group-text-bg'),
        outline: $('#group-outline'),
        textContent: $('#group-text-content'),
        overlayTitle: $('#overlay-title')
    }
};

const propMap = {
    'prop-text-content': { key: 'content', type: 'prop' },
    'prop-outline-color': { key: 'outlineColor', type: 'style' },
    'prop-outline-size': { key: 'outlineSize', type: 'style', parse: parseFloat },
    'prop-outline-opacity': { key: 'outlineOpacity', type: 'style', parse: parseFloat },
    'prop-shadow-color': { key: 'shadowColor', type: 'style' },
    'prop-shadow-size': { key: 'shadowSize', type: 'style', parse: parseFloat },
    'prop-shadow-opacity': { key: 'shadowOpacity', type: 'style', parse: parseFloat },
    'prop-border-color': { key: 'borderColor', type: 'style' },
    'prop-border-size': { key: 'borderSize', type: 'style', parse: parseFloat },
    'prop-border-opacity': { key: 'borderOpacity', type: 'style', parse: parseFloat },
    'prop-corner-radius': { key: 'cornerRadius', type: 'style', parse: parseFloat },
    'prop-padding': { key: 'padding', type: 'style', parse: parseFloat },
    'prop-bg-type': { key: 'bgType', type: 'style' },
    'prop-bg-color1': { key: 'bgColor1', type: 'style' },
    'prop-bg-color2': { key: 'bgColor2', type: 'style' },
    'prop-bg-direction': { key: 'bgDirection', type: 'style' }
};

// --- Initialization ---
function initUI()
{
    $dom.width.val((window.state.params.width / getDPI()).toFixed(2));
    $dom.height.val((window.state.params.height / getDPI()).toFixed(2));
    $dom.spineW.val((window.state.params.spineWidth / getDPI()).toFixed(2));
    $dom.dpi.val(window.state.params.dpi || 300);
    $dom.aMult.val(window.state.params.alphaMult);
    $dom.aPower.val(window.state.params.alphaPower);
    $dom.pAlpha.val(window.state.params.previewAlpha);
    $dom.pAlphaVal.text(Math.round(window.state.params.previewAlpha * 100) + "%");
    $dom.frontOff.val(window.state.params.frontOffset);
    $dom.backOff.val(window.state.params.backOffset);
    $('#lbl-frontOffset').text(window.state.params.frontOffset + "%");
    $('#lbl-backOffset').text(window.state.params.backOffset + "%");
    $dom.frontZoom.val(window.state.params.frontZoom ?? 100);
    $dom.backZoom.val(window.state.params.backZoom ?? 100);
    $('#lbl-frontZoom').text((window.state.params.frontZoom ?? 100) + "%");
    $('#lbl-backZoom').text((window.state.params.backZoom ?? 100) + "%");
}
initUI();

// --- Helper / Utility functions ---
window.toRgba = function (hex, alpha)
{
    hex = hex || '#000000';
    let c = hex.substring(1).split('');
    if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    c = '0x' + c.join('');
    return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${alpha})`;
};

function resetShadow(ctx)
{
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

function applyShadowFromStyle(ctx, style, resScale, scale)
{
    const s = style || {};
    const size = (s.shadowSize || 0);
    const opacity = (s.shadowOpacity != null ? s.shadowOpacity : 0);

    if (size > 0 && opacity > 0)
    {
        ctx.shadowColor = window.toRgba(s.shadowColor || '#000000', opacity);
        ctx.shadowBlur = size * 2 * resScale * (scale || 1);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    } else
    {
        resetShadow(ctx);
    }
}

function drawRoundedRect(ctx, x, y, width, height, radius)
{
    radius = Math.max(0, radius || 0);
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function beginRoundedClip(ctx, rect)
{
    ctx.save();
    ctx.beginPath();
    drawRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.r || 0);
    ctx.clip();
}

function computeBoxModel(boxW, boxH, style, scaleMul, resScale)
{
    style = style || {};
    const scale = scaleMul || 1;
    const borderBase = style.borderSize || 0;
    const borderPx = borderBase * resScale * scale;
    const paddingPx = (style.padding || 0) * resScale * scale;

    const outerX = -boxW / 2;
    const outerY = -boxH / 2;

    const borderRect = {
        x: outerX + borderPx / 2,
        y: outerY + borderPx / 2,
        w: Math.max(0, boxW - borderPx),
        h: Math.max(0, boxH - borderPx)
    };

    const contentRect = {
        x: outerX + borderPx + paddingPx,
        y: outerY + borderPx + paddingPx,
        w: Math.max(0, boxW - 2 * (borderPx + paddingPx)),
        h: Math.max(0, boxH - 2 * (borderPx + paddingPx))
    };

    const outerRadius = (style.cornerRadius || 0) * resScale * scale;
    const borderRadius = Math.max(0, outerRadius - borderPx / 2);
    const contentRadius = Math.max(0, borderRadius - paddingPx);

    borderRect.r = borderRadius;
    contentRect.r = contentRadius;

    return {
        borderPx, paddingPx,
        outerRect: { x: outerX, y: outerY, w: boxW, h: boxH, r: outerRadius },
        borderRect, contentRect
    };
}

function drawBackgroundForStyle(ctx, style, rect)
{
    const s = style || {};
    if (!s.bgType || s.bgType === 'none') return;
    if (rect.w <= 0 || rect.h <= 0) return;

    let fill;
    if (s.bgType === 'solid')
    {
        fill = s.bgColor1 || '#000000';
    } else if (s.bgType === 'gradient')
    {
        const c1 = s.bgColor1 || '#000000';
        const c2 = s.bgColor2 || '#ffffff';
        let x0, y0, x1, y1;
        if (s.bgDirection === 'horizontal') { x0 = rect.x; y0 = 0; x1 = rect.x + rect.w; y1 = 0; }
        else if (s.bgDirection === 'diag1') { x0 = rect.x; y0 = rect.y; x1 = rect.x + rect.w; y1 = rect.y + rect.h; }
        else if (s.bgDirection === 'diag2') { x0 = rect.x; y0 = rect.y + rect.h; x1 = rect.x + rect.w; y1 = rect.y; }
        else { x0 = 0; y0 = rect.y; x1 = 0; y1 = rect.y + rect.h; }
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, c1);
        grad.addColorStop(1, c2);
        fill = grad;
    } else { return; }

    ctx.save();
    ctx.beginPath();
    drawRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.r || 0);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
}

function drawBorderForStyle(ctx, style, rect, borderPx, defaultColor)
{
    if (!borderPx || borderPx <= 0) return;
    if (rect.w <= 0 || rect.h <= 0) return;
    const s = style || {};
    resetShadow(ctx);
    ctx.save();
    ctx.beginPath();
    drawRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.r || 0);
    ctx.strokeStyle = window.toRgba(s.borderColor || defaultColor || '#ffffff', s.borderOpacity != null ? s.borderOpacity : 1);
    ctx.lineWidth = borderPx;
    ctx.stroke();
    ctx.restore();
}

function wrapTextIntoLines(ctx, text, maxWidth, maxHeight, lineHeight)
{
    const lines = [];
    let currentLine = '';
    if (!text || maxWidth <= 0 || maxHeight <= 0) return [];
    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));

    for (let i = 0; i < text.length; i++)
    {
        const ch = text[i];
        const testLine = currentLine + ch;
        const testWidth = ctx.measureText(testLine).width;
        if (testWidth > maxWidth && currentLine.length > 0)
        {
            lines.push(currentLine);
            currentLine = ch;
            if (lines.length >= maxLines) break;
        } else
        {
            currentLine = testLine;
        }
    }
    if (lines.length < maxLines && currentLine.length > 0)
    {
        lines.push(currentLine);
    }
    return lines;
}

function getTextBoxGeometry(obj, canvasW, canvasH)
{
    if (obj.boundsWidthPct && obj.boundsHeightPct)
    {
        return {
            centerX: canvasW * ((obj.x + obj.boundsWidthPct / 2) / 100),
            centerY: canvasH * ((obj.y + obj.boundsHeightPct / 2) / 100),
            boxW: canvasW * (obj.boundsWidthPct / 100),
            boxH: canvasH * (obj.boundsHeightPct / 100)
        };
    }
    // Safe lookup for DOM using native getElementById to avoid selector issues
    const el = document.getElementById('ov-' + obj.id);
    const wrapperRect = $dom.canvasWrapper[0].getBoundingClientRect();
    if (el && wrapperRect.width > 0)
    {
        const rect = el.getBoundingClientRect();
        const relW = rect.width / wrapperRect.width;
        const relH = rect.height / wrapperRect.height;
        return {
            centerX: canvasW * (((rect.left - wrapperRect.left) / wrapperRect.width) + relW / 2),
            centerY: canvasH * (((rect.top - wrapperRect.top) / wrapperRect.height) + relH / 2),
            boxW: canvasW * relW,
            boxH: canvasH * relH
        };
    }
    const boxW = canvasW * 0.3;
    const boxH = canvasH * 0.1;
    return { centerX: boxW / 2, centerY: boxH / 2, boxW, boxH };
}

function getImageBoxGeometry(obj, canvasW, canvasH, imgEl)
{
    const imgW = imgEl.naturalWidth || imgEl.width || 1;
    const imgH = imgEl.naturalHeight || imgEl.height || 1;
    const aspect = imgH / imgW;
    const scale = obj.scale || 1;
    let baseWidthPct = obj.boundsWidthPct || 30;
    const baseW = canvasW * (baseWidthPct / 100);
    const baseH = baseW * aspect;
    return {
        centerX: (canvasW * (obj.x / 100)) + baseW / 2,
        centerY: (canvasH * (obj.y / 100)) + baseH / 2,
        baseW, baseH,
        visualW: baseW * scale,
        visualH: baseH * scale,
        scale
    };
}

// --- Event Listeners ---
let debounceTimer;
function scheduleUpdate(action, isHeavy)
{
    $dom.spinner.show();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() =>
    {
        action();
        $dom.spinner.hide();
    }, isHeavy ? RENDER_DELAY_MS : 30);
}

function saveState()
{
    localStorage.setItem('coverParams', JSON.stringify(window.state.params));
}

$('#finalWidth, #finalHeight, #spineWidth').on('input', function ()
{
    const val = parseFloat($(this).val());
    if (isNaN(val)) return;
    const id = $(this).attr('id');
    const key = id === 'spineWidth' ? 'spineWidth' : (id === 'finalWidth' ? 'width' : 'height');
    window.state.params[key] = Math.round(val * getDPI());
    saveState();
    isSpineCacheDirty = true;
    scheduleUpdate(() =>
    {
        updateLabels();
        if (!window.state.isCustomTemplate) generateDefaultTemplate();
        else window.requestRender();
    }, true);
});

$('#spineAlphaMultiplier, #spineAlphaPower').on('input', function ()
{
    const key = $(this).attr('id') === 'spineAlphaMultiplier' ? 'alphaMult' : 'alphaPower';
    window.state.params[key] = parseFloat($(this).val());
    saveState();
    isSpineCacheDirty = true;
    scheduleUpdate(() => window.requestRender(), true);
});

$('#dpi').on('input', function ()
{
    const val = parseInt($(this).val());
    if (isNaN(val) || val < 72) return;

    const oldDpi = getDPI();
    const widthIn = window.state.params.width / oldDpi;
    const heightIn = window.state.params.height / oldDpi;
    const spineIn = window.state.params.spineWidth / oldDpi;

    window.state.params.dpi = val;
    window.state.params.width = Math.round(widthIn * val);
    window.state.params.height = Math.round(heightIn * val);
    window.state.params.spineWidth = Math.round(spineIn * val);

    $dom.width.val(widthIn.toFixed(2));
    $dom.height.val(heightIn.toFixed(2));
    $dom.spineW.val(spineIn.toFixed(2));

    saveState();
    isSpineCacheDirty = true;
    scheduleUpdate(() =>
    {
        updateLabels();
        if (!window.state.isCustomTemplate) generateDefaultTemplate();
        else window.requestRender();
    }, true);
});

$dom.pAlpha.on('input', function ()
{
    window.state.params.previewAlpha = parseFloat($(this).val());
    $dom.pAlphaVal.text(Math.round(window.state.params.previewAlpha * 100) + "%");
    saveState();
    scheduleUpdate(() => window.requestRender(), false);
});

$('#frontOffset, #backOffset').on('input', function ()
{
    const isFront = $(this).attr('id') === 'frontOffset';
    const val = parseFloat($(this).val());
    window.state.params[isFront ? 'frontOffset' : 'backOffset'] = val;
    $('#lbl-' + (isFront ? 'frontOffset' : 'backOffset')).text(val + "%");
    saveState();
    if (window._sliderRaf) cancelAnimationFrame(window._sliderRaf);
    window._sliderRaf = requestAnimationFrame(() => window.requestRender());
});

$('#frontZoom, #backZoom').on('input', function ()
{
    const isFront = $(this).attr('id') === 'frontZoom';
    const val = parseFloat($(this).val());
    window.state.params[isFront ? 'frontZoom' : 'backZoom'] = val;
    $('#lbl-' + (isFront ? 'frontZoom' : 'backZoom')).text(val + "%");
    saveState();
    if (window._sliderRaf) cancelAnimationFrame(window._sliderRaf);
    window._sliderRaf = requestAnimationFrame(() => window.requestRender());
});

// --- File Handlers ---
window.triggerFile = function (id) { $('#' + id).click(); };

function createScaledBitmap(img, key, callback)
{
    const scale = Math.min(1, MAX_BITMAP_DIM / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    if (typeof createImageBitmap !== 'function')
    {
        window.state.bitmaps[key] = img;
        if (callback) callback();
        return;
    }
    createImageBitmap(img, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' }).then(bitmap =>
    {
        const old = window.state.bitmaps[key];
        if (old && typeof old.close === 'function') old.close();
        window.state.bitmaps[key] = bitmap;
        if (callback) callback();
    }).catch(() =>
    {
        window.state.bitmaps[key] = img;
        if (callback) callback();
    });
}

function setupImageHandler(zoneId, fileInputId, imageKey, infoId)
{
    const $zone = $('#' + zoneId);

    const handleFile = (file) =>
    {
        if (file && file.type.startsWith('image/'))
        {
            const reader = new FileReader();
            reader.onload = (e) =>
            {
                const img = new Image();
                img.onload = () =>
                {
                    window.state.images[imageKey] = img;
                    if (imageKey === 'template')
                    {
                        window.state.isCustomTemplate = true;
                        $zone.removeClass('is-template');
                    }
                    if (imageKey === 'spine') isSpineCacheDirty = true;
                    $zone.addClass('has-image');
                    updateLabels();
                    createScaledBitmap(img, imageKey, () => window.requestRender());
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    };

    $('#' + fileInputId).on('change', (e) => handleFile(e.target.files[0]));

    if ($zone.length)
    {
        $zone.on('dragover', (e) => { e.preventDefault(); $zone.addClass('active'); })
            .on('dragleave', (e) => { e.preventDefault(); $zone.removeClass('active'); })
            .on('drop', (e) =>
            {
                e.preventDefault();
                $zone.removeClass('active');
                handleFile(e.originalEvent.dataTransfer.files[0]);
            });
    }
}

setupImageHandler('dz-template', 'file-template', 'template', 'info-template');
setupImageHandler('dz-back', 'file-back', 'back', 'info-back');
setupImageHandler('dz-front', 'file-front', 'front', 'info-front');
setupImageHandler('dz-spine', 'file-spine', 'spine', 'info-spine');

// --- OVERLAY SYSTEM ---

$('#file-overlay-img').on('change', function (e)
{
    const file = e.target.files[0];
    if (file)
    {
        const reader = new FileReader();
        reader.onload = (evt) => window.addImageOverlay(evt.target.result);
        reader.readAsDataURL(file);
    }
    $(this).val('');
});

function createOverlayObject(type, content)
{
    // FIX: Replaced Math.random().toString() (which includes a dot) with underscore.
    // jQuery selectors break on dots in IDs.
    return {
        id: Date.now() + '_' + Math.floor(Math.random() * 1000),
        type: type, content: content,
        x: 50, y: 50, scale: 1, fontScale: 1, rotation: 0,
        align: 'left', fontFamily: 'Arial',
        boundsWidthPct: 30, boundsHeightPct: 10,
        style: {
            outlineColor: '#000000', outlineSize: 0, outlineOpacity: 1,
            shadowColor: '#000000', shadowSize: 0, shadowOpacity: 1,
            borderColor: '#ffffff', borderSize: 0, borderOpacity: 1,
            cornerRadius: 0, padding: 0,
            bgType: 'none', bgColor1: '#000000', bgColor2: '#ffffff', bgDirection: 'vertical'
        }
    };
}

window.addTextOverlay = function ()
{
    const obj = createOverlayObject('text', 'New Text');
    window.overlays.push(obj);
    renderDomOverlays();
    selectOverlay(obj.id);
};

window.addImageOverlay = function (src)
{
    const obj = createOverlayObject('image', src);
    obj.boundsWidthPct = 30; obj.boundsHeightPct = null;
    window.overlays.push(obj);
    renderDomOverlays();
    selectOverlay(obj.id);
};

window.deleteSelectedOverlay = function ()
{
    if (window.selectedOverlayId)
    {
        window.overlays = window.overlays.filter(o => o.id !== window.selectedOverlayId);
        deselectOverlay();
        renderDomOverlays();
    }
};

function selectOverlay(id)
{
    window.selectedOverlayId = id;
    $dom.panelLayout.removeClass('active');
    $dom.panelOverlay.addClass('active');

    const obj = window.overlays.find(o => o.id === id);
    if (!obj) return;

    const isText = obj.type === 'text';
    $dom.groups.overlayTitle.text(isText ? "Text Properties" : "Image Properties");
    $dom.groups.textContent.css('display', isText ? 'flex' : 'none');
    $dom.groups.textBg.css('display', isText ? 'grid' : 'none');
    $dom.groups.border.css('display', 'grid');
    if ($dom.groups.outline.length) $dom.groups.outline.css('display', isText ? 'block' : 'none');

    $.each(propMap, (elmId, conf) =>
    {
        let val;
        if (conf.key === 'content') val = obj.content;
        else val = (obj.style[conf.key] !== undefined) ? obj.style[conf.key] : '';
        if (val === undefined || val === null) val = conf.parse ? 0 : '#000000';
        $('#' + elmId).val(val);
    });

    $('.overlay-item').removeClass('selected');
    // Safe selection
    $(document.getElementById('ov-' + id)).addClass('selected');
}

function deselectOverlay()
{
    window.selectedOverlayId = null;
    $('.overlay-item').removeClass('selected');
    $('.popup-menu').removeClass('show');
    $dom.panelOverlay.removeClass('active');
    $dom.panelLayout.addClass('active');
}

const propSelectors = Object.keys(propMap).map(id => '#' + id).join(',');

$(document).on('input change', propSelectors, function ()
{
    if (!window.selectedOverlayId) return;
    const obj = window.overlays.find(o => o.id === window.selectedOverlayId);
    if (!obj) return;

    const id = $(this).attr('id');
    const conf = propMap[id];
    let val = $(this).val();
    if (conf.parse) val = conf.parse(val);

    if (conf.type === 'prop')
    {
        obj[conf.key] = val;
        if (conf.key === 'content')
        {
            const $el = $(document.getElementById('ov-' + obj.id));
            if (obj.type === 'text') $el.find('.overlay-content').text(obj.content);
        }
    } else
    {
        obj.style[conf.key] = val;
    }
    updateDomOverlayStyle(obj);
});

// --- DOM RENDERER FOR OVERLAYS ---
function renderDomOverlays()
{
    const currentIds = window.overlays.map(o => 'ov-' + o.id);

    // Cleanup removed
    $('.overlay-item').each(function ()
    {
        if (!currentIds.includes(this.id)) $(this).remove();
    });

    window.overlays.forEach(obj =>
    {
        // FIX: Use native getElementById wrapped in jQuery to safely handle IDs.
        // Even with the safe ID gen above, this is more robust.
        let $el = $(document.getElementById('ov-' + obj.id));

        // Create if new
        if (!$el.length)
        {
            $el = $('<div>', {
                id: 'ov-' + obj.id,
                class: 'overlay-item'
            }).on('mousedown', (e) => handleDragStart(e, obj.id));

            $('<div>', { class: 'menu-trigger', html: '<svg><use href="#icon-dots"/></svg>' })
                .on('click', (e) => { e.stopPropagation(); toggleMenu(obj.id); })
                .appendTo($el);

            $('<div>', { class: 'popup-menu', id: 'menu-' + obj.id }).html(generateMenuHTML(obj)).appendTo($el);

            $('<div>', { class: 'overlay-content' }).appendTo($el);
            $dom.canvasWrapper.append($el);
        }

        const $content = $el.find('.overlay-content');

        if (obj.type === 'text')
        {
            ['left', 'right', 'top', 'bottom'].forEach(side =>
            {
                if (!$el.find('.resize-' + side).length)
                {
                    $('<div>', { class: 'resize-handle resize-' + side })
                        .on('mousedown', (e) => startResize(e, obj.id, side))
                        .appendTo($el);
                }
            });
            $content.text(obj.content);
        } else
        {
            $el.find('.resize-handle').remove();
            if (!$content.find('img').length)
            {
                $('<img>', { draggable: false }).css({ display: 'block', pointerEvents: 'none' }).appendTo($content);
            }
            $content.find('img').attr('src', obj.content);
        }

        updateDomOverlayStyle(obj);
    });
}

function generateMenuHTML(obj)
{
    const fonts = ['Arial', "'Times New Roman'", "'Courier New'", 'Georgia', 'Verdana', 'Impact'];
    const fontOpts = fonts.map(f => `<option value="${f}" ${obj.fontFamily == f ? 'selected' : ''}>${f.replace(/'/g, '')}</option>`).join('');

    let html = `
        <div class="popup-row"><label>Rot</label><input type="range" min="0" max="360" value="${obj.rotation}" oninput="updateTransform('${obj.id}', 'rotation', this.value)"></div>
        <div class="popup-row"><label>Scale</label><input type="range" min="0.1" max="3" step="0.1" value="${obj.type === 'text' ? obj.fontScale : obj.scale}" oninput="updateTransform('${obj.id}', 'scale', this.value)"></div>`;

    if (obj.type === 'text')
    {
        html += `<div class="popup-row"><label>Font</label><select onchange="updateTransform('${obj.id}', 'fontFamily', this.value)">${fontOpts}</select></div>`;
        const aligns = ['left', 'center', 'right', 'justify'];
        const icons = { left: 'icon-left', center: 'icon-center', right: 'icon-right', justify: 'icon-full' };
        const alignBtns = aligns.map(a =>
            `<div class="icon-btn ${obj.align == a ? 'active' : ''}" onclick="updateTransform('${obj.id}', 'align', '${a}')"><svg><use href="#${icons[a]}"/></svg></div>`
        ).join('');
        html += `<div class="popup-row"><label>Align</label><div class="icon-btn-group">${alignBtns}</div></div>`;
    }
    return html;
}

window.updateTransform = function (id, key, val)
{
    const obj = window.overlays.find(o => o.id === id);
    if (!obj) return;
    if (key === 'scale')
    {
        if (obj.type === 'text') obj.fontScale = parseFloat(val);
        else obj.scale = parseFloat(val);
    } else if (key === 'rotation')
    {
        obj.rotation = parseFloat(val);
    } else
    {
        obj[key] = val;
    }
    if (key === 'align') $('#menu-' + id).html(generateMenuHTML(obj));
    updateDomOverlayStyle(obj);
};

function toggleMenu(id)
{
    const $m = $('#menu-' + id);
    const wasShow = $m.hasClass('show');
    $('.popup-menu').removeClass('show');
    if (!wasShow) $m.addClass('show');
}

function updateDomOverlayStyle(obj)
{
    // FIX: Use safe selector
    const $el = $(document.getElementById('ov-' + obj.id));
    if (!$el.length) return;
    const $content = $el.find('.overlay-content');
    const $img = $content.find('img');
    const s = obj.style;

    if (obj.type === 'text' && (!obj.boundsHeightPct || obj.boundsHeightPct <= 0)) obj.boundsHeightPct = 10;

    $el.css({
        left: obj.x + '%',
        top: obj.y + '%',
        width: obj.boundsWidthPct ? obj.boundsWidthPct + '%' : 'auto',
        height: obj.boundsHeightPct ? obj.boundsHeightPct + '%' : 'auto',
        borderRadius: (s.cornerRadius || 0) + 'px'
    });

    const rot = `rotate(${obj.rotation}deg)`;
    const trans = obj.type === 'image' ? `${rot} scale(${obj.scale})` : rot;
    $content.css('transform', trans);

    const hexToRgbA = (hex, alpha) => window.toRgba(hex, alpha);
    const hasShadow = (s.shadowSize > 0 && s.shadowOpacity > 0);
    const shadowColorCss = hexToRgbA(s.shadowColor, s.shadowOpacity != null ? s.shadowOpacity : 1);
    const shadowStr = hasShadow ? `drop-shadow(0px 0px ${s.shadowSize}px ${shadowColorCss})` : 'none';
    const borderStr = (s.borderSize > 0) ? `${s.borderSize}px solid ${hexToRgbA(s.borderColor, s.borderOpacity != null ? s.borderOpacity : 1)}` : 'none';

    if (obj.type === 'text')
    {
        $content.css({
            fontFamily: obj.fontFamily,
            fontSize: (50 * obj.fontScale) + "px",
            color: "#FFFFFF",
            textAlign: obj.align,
            padding: (s.padding || 0) + 'px',
            webkitTextStroke: (s.outlineSize > 0) ? `${s.outlineSize}px ${hexToRgbA(s.outlineColor, s.outlineOpacity)}` : '0',
            filter: 'none',
            textShadow: hasShadow ? `0px 0px ${s.shadowSize}px ${shadowColorCss}` : 'none',
            background: 'transparent',
            border: borderStr,
            borderRadius: (s.cornerRadius || 0) + 'px'
        });

        if (s.bgType === 'solid') $content.css('background', s.bgColor1 || '#000000');
        else if (s.bgType === 'gradient')
        {
            const dirs = { 'horizontal': 'to right', 'diag1': 'to bottom right', 'diag2': 'to top right', 'vertical': 'to bottom' };
            $content.css('background', `linear-gradient(${dirs[s.bgDirection] || 'to bottom'}, ${s.bgColor1 || '#000000'}, ${s.bgColor2 || '#ffffff'})`);
        }

    } else if ($img.length)
    {
        $content.css({
            padding: (s.padding || 0) + 'px',
            border: borderStr,
            borderRadius: (s.cornerRadius || 0) + 'px'
        });
        $img.css({
            filter: shadowStr,
            width: "100%", height: "auto",
            border: 'none', borderRadius: 'inherit'
        });
    }
}

// --- DRAG & RESIZE LOGIC ---
let dragStartMouse = { x: 0, y: 0 };
let dragStartObjPos = { x: 0, y: 0 };
let resizeData = null;

function handleDragStart(e, id)
{
    const $target = $(e.target);
    if ($target.is('input, select, label') || $target.closest('.popup-menu').length || $target.hasClass('resize-handle')) return;

    window.activeDragId = id;
    selectOverlay(id);
    const obj = window.overlays.find(o => o.id === id);
    if (!obj) return;

    dragStartMouse = { x: e.clientX, y: e.clientY };
    dragStartObjPos = { x: obj.x, y: obj.y };
    e.stopPropagation();
}

function startResize(e, id, side)
{
    e.stopPropagation();
    window.isResizing = true;
    resizeData = { id, side, startX: e.clientX, startY: e.clientY };
    selectOverlay(id);
}

$(document).on('mousemove', (e) =>
{
    const wrapperRect = $dom.canvasWrapper[0].getBoundingClientRect();

    if (window.activeDragId)
    {
        const obj = window.overlays.find(o => o.id === window.activeDragId);
        if (!obj) return;

        const dxPct = ((e.clientX - dragStartMouse.x) / wrapperRect.width) * 100;
        const dyPct = ((e.clientY - dragStartMouse.y) / wrapperRect.height) * 100;

        obj.x = dragStartObjPos.x + dxPct;
        obj.y = dragStartObjPos.y + dyPct;
        updateDomOverlayStyle(obj);

    } else if (window.isResizing && resizeData)
    {
        const obj = window.overlays.find(o => o.id === resizeData.id);
        if (!obj || obj.type !== 'text') return;

        const el = document.getElementById('ov-' + obj.id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const side = resizeData.side;

        if (side === 'left' || side === 'right')
        {
            const deltaX = e.clientX - resizeData.startX;
            let newLeft = rect.left + (side === 'left' ? deltaX : 0);
            let newRight = rect.right + (side === 'right' ? deltaX : 0);

            let newWidthPx = Math.max(40, newRight - newLeft);
            const widthPct = (newWidthPx / wrapperRect.width) * 100;
            const leftPct = ((newLeft - wrapperRect.left) / wrapperRect.width) * 100;

            obj.boundsWidthPct = Math.max(5, Math.min(100, widthPct));
            obj.x = Math.max(0, Math.min(100 - obj.boundsWidthPct, leftPct));
            resizeData.startX = e.clientX;
        }

        if (side === 'top' || side === 'bottom')
        {
            const deltaY = e.clientY - resizeData.startY;
            let newTop = rect.top + (side === 'top' ? deltaY : 0);
            let newBottom = rect.bottom + (side === 'bottom' ? deltaY : 0);

            let newHeightPx = Math.max(30, newBottom - newTop);
            const heightPct = (newHeightPx / wrapperRect.height) * 100;
            const topPct = ((newTop - wrapperRect.top) / wrapperRect.height) * 100;

            obj.boundsHeightPct = Math.max(3, Math.min(100, heightPct));
            obj.y = Math.max(0, Math.min(100 - obj.boundsHeightPct, topPct));
            resizeData.startY = e.clientY;
        }
        updateDomOverlayStyle(obj);
    }
});

$(document).on('mouseup', () =>
{
    window.activeDragId = null;
    window.isResizing = false;
    resizeData = null;
});

$dom.canvasWrapper.on('mousedown', (e) =>
{
    if (e.target.id === 'previewCanvas' || e.target.id === 'canvas-wrapper') deselectOverlay();
});

// --- RENDERING ---

function calculateGeometry()
{
    const p = window.state.params;
    const frontWidth = Math.floor((p.width - p.spineWidth) / 2);
    const backWidth = p.width - frontWidth - p.spineWidth;
    const blendWidth = Math.floor(p.spineWidth / 2);
    return {
        final: { w: p.width, h: p.height },
        spine: { x: backWidth, y: 0, w: p.spineWidth, h: p.height },
        back: { x: 0, y: 0, w: backWidth, h: p.height },
        front: { x: backWidth + p.spineWidth, y: 0, w: frontWidth, h: p.height },
        blendLeft: { x: backWidth, y: 0, w: blendWidth, h: p.height },
        blendRight: { x: backWidth + blendWidth, y: 0, w: blendWidth, h: p.height }
    };
}

function updateCanvasWrapperSize()
{
    const geo = calculateGeometry();
    const coverW = geo.final.w;
    const coverH = geo.final.h;

    const mainRect = $dom.mainArea[0].getBoundingClientRect();
    const availW = Math.max(10, mainRect.width - 16);
    const availH = Math.max(10, mainRect.height - 16);
    const scale = Math.min(availW / coverW, availH / coverH);

    $dom.canvasWrapper.css({
        width: (coverW * scale) + 'px',
        height: (coverH * scale) + 'px'
    });
    $dom.canvas.css({ width: '100%', height: '100%' });
}

window.requestRender = function ()
{
    updateCanvasWrapperSize();
    renderToCanvas($dom.canvas[0], false);
};

function renderToCanvas(targetCanvas, isExport)
{
    const geo = calculateGeometry();

    if (isSpineCacheDirty) { updateSpineCache(geo.spine); isSpineCacheDirty = false; }

    if (targetCanvas.width !== geo.final.w || targetCanvas.height !== geo.final.h)
    {
        targetCanvas.width = geo.final.w; targetCanvas.height = geo.final.h;
    }

    const ctx = targetCanvas.getContext('2d');
    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

    const templateSrc = window.state.bitmaps.template || window.state.images.template;
    if (!isExport && templateSrc)
    {
        ctx.drawImage(templateSrc, 0, 0, geo.final.w, geo.final.h);
    }

    if (offCanvas.width !== geo.final.w || offCanvas.height !== geo.final.h)
    {
        offCanvas.width = geo.final.w; offCanvas.height = geo.final.h;
    }
    const oCtx = offCanvas.getContext('2d');
    oCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
    drawCompositeLayer(oCtx, geo, isExport);

    ctx.save();
    if (!isExport) ctx.globalAlpha = window.state.params.previewAlpha;
    ctx.drawImage(offCanvas, 0, 0);
    ctx.restore();

    if (isExport) renderOverlaysToContext(ctx, geo.final.w, geo.final.h);
}

function renderOverlaysToContext(ctx, canvasW, canvasH)
{
    const wrapperRect = $dom.canvasWrapper[0].getBoundingClientRect();
    const resScale = canvasW / (wrapperRect.width || canvasW);

    window.overlays.forEach(obj =>
    {
        const style = obj.style || {};

        if (obj.type === 'text')
        {
            const geo = getTextBoxGeometry(obj, canvasW, canvasH);
            const layout = computeBoxModel(geo.boxW, geo.boxH, style, 1, resScale);

            ctx.save();
            ctx.translate(geo.centerX, geo.centerY);
            ctx.rotate(obj.rotation * Math.PI / 180);

            resetShadow(ctx);
            drawBackgroundForStyle(ctx, style, layout.borderRect);
            drawBorderForStyle(ctx, style, layout.borderRect, layout.borderPx, '#ffffff');

            const fontSize = 50 * (obj.fontScale || 1) * resScale;
            ctx.font = `${fontSize}px ${obj.fontFamily}`;
            ctx.fillStyle = "white";
            ctx.textBaseline = "top";

            const lines = wrapTextIntoLines(ctx, obj.content || '', layout.contentRect.w, layout.contentRect.h, fontSize * 1.2);

            const outlinePx = (style.outlineSize || 0) * resScale;
            const clipMargin = outlinePx + ((style.shadowSize || 0) * 2 * resScale) + 2;

            ctx.beginPath();
            drawRoundedRect(ctx, layout.contentRect.x - clipMargin, layout.contentRect.y - clipMargin, layout.contentRect.w + clipMargin * 2, layout.contentRect.h + clipMargin * 2, (layout.contentRect.r || 0) + clipMargin);
            ctx.clip();

            applyShadowFromStyle(ctx, style, resScale, 1);

            if (style.outlineSize > 0)
            {
                ctx.strokeStyle = window.toRgba(style.outlineColor || '#000000', style.outlineOpacity != null ? style.outlineOpacity : 1);
                ctx.lineWidth = outlinePx;
            }

            for (let i = 0; i < lines.length; i++)
            {
                const line = lines[i];
                const lw = ctx.measureText(line).width;
                let x = layout.contentRect.x;
                if (obj.align === 'center') x += (layout.contentRect.w - lw) / 2;
                else if (obj.align === 'right') x += (layout.contentRect.w - lw);
                ctx.textAlign = 'left';

                const y = layout.contentRect.y + i * fontSize * 1.2;
                if (style.outlineSize > 0) ctx.strokeText(line, x, y);
                ctx.fillText(line, x, y);
            }
            ctx.restore();

        } else if (obj.type === 'image')
        {
            const $img = $(document.getElementById('ov-' + obj.id)).find('img');
            if (!$img.length || !$img[0].complete || $img[0].naturalWidth === 0) return;
            const imgEl = $img[0];

            const geo = getImageBoxGeometry(obj, canvasW, canvasH, imgEl);
            const aspect = imgEl.naturalHeight / imgEl.naturalWidth;

            const borderPxRaw = (style.borderSize || 0) * resScale * geo.scale;
            const paddingPxRaw = (style.padding || 0) * resScale * geo.scale;
            const contentW = Math.max(0, geo.visualW - 2 * (borderPxRaw + paddingPxRaw));
            const boxH = (contentW * aspect) + 2 * (borderPxRaw + paddingPxRaw);
            const centerY = (geo.centerY - geo.visualH / 2) + boxH / 2;

            const layout = computeBoxModel(geo.visualW, boxH, style, geo.scale, resScale);

            ctx.save();
            ctx.translate(geo.centerX, centerY);
            ctx.rotate(obj.rotation * Math.PI / 180);

            resetShadow(ctx);
            beginRoundedClip(ctx, layout.borderRect);
            applyShadowFromStyle(ctx, style, resScale, geo.scale);

            if (layout.contentRect.w > 0 && layout.contentRect.h > 0)
            {
                ctx.drawImage(imgEl, layout.contentRect.x, layout.contentRect.y, layout.contentRect.w, layout.contentRect.h);
            }
            ctx.restore();
            drawBorderForStyle(ctx, style, layout.borderRect, layout.borderPx, '#ffffff');
            ctx.restore();
        }
    });
}

function drawCompositeLayer(ctx, geo, isExport)
{
    const src = isExport ? window.state.images : window.state.bitmaps;
    if (src.back) drawImageCover(ctx, src.back, geo.back, window.state.params.backOffset, window.state.params.backZoom ?? 100);
    else drawPlaceholder(ctx, geo.back, "");

    if (src.front) drawImageCover(ctx, src.front, geo.front, window.state.params.frontOffset, window.state.params.frontZoom ?? 100);
    else drawPlaceholder(ctx, geo.front, "");

    if (src.back) processAutoBleed(ctx, src.back, geo.back, geo.blendLeft, true, window.state.params.backOffset, window.state.params.backZoom ?? 100);
    if (src.front) processAutoBleed(ctx, src.front, geo.front, geo.blendRight, false, window.state.params.frontOffset, window.state.params.frontZoom ?? 100);

    if (window.state.images.spine) ctx.drawImage(spineCacheCanvas, geo.spine.x, geo.spine.y);
    else { ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 1; ctx.strokeRect(geo.spine.x, geo.spine.y, geo.spine.w, geo.spine.h); }
}

function updateSpineCache(destRect)
{
    if (spineCacheCanvas.width !== destRect.w || spineCacheCanvas.height !== destRect.h)
    {
        spineCacheCanvas.width = destRect.w; spineCacheCanvas.height = destRect.h;
    }
    const sCtx = spineCacheCanvas.getContext('2d');
    sCtx.clearRect(0, 0, destRect.w, destRect.h);
    const img = window.state.bitmaps.spine || window.state.images.spine;
    if (!img) return;

    const trimmedY = scanForBlackRows(img);
    const effectiveH = trimmedY.bottom - trimmedY.top;
    const crop = getCropCoords(img.width, effectiveH, destRect.w, destRect.h, 0);
    const finalCropY = crop.y + trimmedY.top;

    const mult = window.state.params.alphaMult;
    const pow = window.state.params.alphaPower;
    sCtx.drawImage(img, crop.x, finalCropY, crop.w, crop.h, 0, 0, destRect.w, destRect.h);

    if (mult === 0 || pow === 0) return;
    const imgData = sCtx.getImageData(0, 0, destRect.w, destRect.h);
    const data = imgData.data;
    const w = destRect.w;
    const halfW = w / 2;

    for (let y = 0; y < destRect.h; y++)
    {
        for (let x = 0; x < w; x++)
        {
            const dist = Math.min(x, w - x - 1);
            let alpha = Math.pow((dist / halfW) * mult, pow);
            if (alpha > 1.0) alpha = 1.0; if (alpha < 0.0) alpha = 0.0;
            const i = (y * w + x) * 4;
            data[i + 3] = Math.floor(data[i + 3] * alpha);
        }
    }
    sCtx.putImageData(imgData, 0, 0);
}

function getCropCoords(imgW, imgH, targetW, targetH, offsetPct, zoom)
{
    const zoomFactor = 100 / (zoom || 100);
    const targetAspect = targetW / targetH;
    const imgAspect = imgW / imgH;
    let cropW, cropH;
    if (targetAspect > imgAspect) { cropW = imgW; cropH = Math.floor(imgW / targetAspect); }
    else { cropH = imgH; cropW = Math.floor(imgH * targetAspect); }

    cropW = Math.floor(cropW * zoomFactor);
    cropH = Math.floor(cropH * zoomFactor);

    let x = (imgW - cropW) / 2;
    if (offsetPct && offsetPct !== 0 && cropW < imgW)
    {
        x += (offsetPct / 100) * imgW;
        if (x < 0) x = 0; if (x + cropW > imgW) x = imgW - cropW;
    }
    return { x: Math.floor(x), y: Math.floor((imgH - cropH) / 2), w: cropW, h: cropH };
}

function drawImageCover(ctx, img, rect, offset, zoom)
{
    const crop = getCropCoords(img.width, img.height, rect.w, rect.h, offset, zoom);
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, rect.x, rect.y, rect.w, rect.h);
}

function processAutoBleed(ctx, img, sourceRect, destRect, isBackCover, offset, zoom)
{
    const crop = getCropCoords(img.width, img.height, sourceRect.w, sourceRect.h, offset, zoom);
    const widthRatio = sourceRect.w / crop.w;
    const neededSourceW = Math.floor(destRect.w / widthRatio);
    const availableGap = isBackCover ? (img.width - (crop.x + crop.w)) : crop.x;

    if (neededSourceW <= availableGap)
    {
        const srcX = isBackCover ? (crop.x + crop.w) : (crop.x - neededSourceW);
        ctx.drawImage(img, srcX, crop.y, neededSourceW, crop.h, destRect.x, destRect.y, destRect.w, destRect.h);
    } else
    {
        const tempCvs = document.createElement('canvas');
        tempCvs.width = destRect.w; tempCvs.height = destRect.h;
        const tCtx = tempCvs.getContext('2d');
        const srcX = isBackCover ? (crop.x + crop.w - neededSourceW) : crop.x;
        tCtx.save(); tCtx.scale(-1, 1);
        tCtx.drawImage(img, srcX, crop.y, neededSourceW, crop.h, -destRect.w, 0, destRect.w, destRect.h);
        tCtx.restore();
        ctx.drawImage(tempCvs, destRect.x, destRect.y);
    }
}

function scanForBlackRows(img)
{
    const c = document.createElement('canvas');
    c.width = 1; c.height = img.height;
    const cx = c.getContext('2d');
    cx.drawImage(img, Math.floor(img.width / 2), 0, 1, img.height, 0, 0, 1, img.height);
    const data = cx.getImageData(0, 0, 1, img.height).data;
    let top = 0, bottom = img.height;
    for (let y = 0; y < img.height; y++)
    {
        if (data[y * 4] > 10 || data[y * 4 + 1] > 10 || data[y * 4 + 2] > 10) { top = y; break; }
    }
    for (let y = img.height - 1; y >= 0; y--)
    {
        if (data[y * 4] > 10 || data[y * 4 + 1] > 10 || data[y * 4 + 2] > 10) { bottom = y + 1; break; }
    }
    return { top, bottom };
}

function drawPlaceholder(ctx, rect, text)
{
    ctx.fillStyle = "#222"; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "#444"; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = "#555"; ctx.font = "bold 50px Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (text) ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2);
}

function updateLabels()
{
    const geo = calculateGeometry();
    $dom.outputDimensions.text(`${window.state.params.width} x ${window.state.params.height} px`);
    const setLabel = (id, key, r) =>
    {
        const img = window.state.images[key];
        const rectText = `[${r.x}, ${r.y}, ${r.w}, ${r.h}] px`;
        const srcText = img ? `Src: ${img.width}x${img.height} px` : "Empty";
        const srcColor = img ? "#4caf50" : "#666";
        $('#' + id).html(`<div class="rect-info">${rectText}</div><div class="src-info" style="color:${srcColor}">${srcText}</div>`);
    };

    const img = window.state.images.template;
    const srcText = (img && window.state.isCustomTemplate) ? `Src: ${img.width}x${img.height} px` : (window.state.isCustomTemplate ? "Custom Upload" : "Default Generated");
    const srcColor = window.state.isCustomTemplate ? "#e0912d" : "#007acc";
    $('#info-template').html(`<div class="rect-info">[0, 0, ${window.state.params.width}, ${window.state.params.height}] px</div><div class="src-info" style="color:${srcColor}">${srcText}</div>`);

    setLabel('info-back', 'back', geo.back);
    setLabel('info-spine', 'spine', geo.spine);
    setLabel('info-front', 'front', geo.front);
}

window.downloadCanvas = function ()
{
    const exportCanvas = document.createElement('canvas');
    renderToCanvas(exportCanvas, true);
    $('<a>', {
        href: exportCanvas.toDataURL('image/jpeg', 0.95),
        download: 'Cover_Composite_HQ.jpg'
    })[0].click();
};

function generateDefaultTemplate()
{
    const tCvs = document.createElement('canvas');
    const W = window.state.params.width; const H = window.state.params.height; const SW = window.state.params.spineWidth;
    tCvs.width = W; tCvs.height = H;
    const tCtx = tCvs.getContext('2d');

    tCtx.fillStyle = "white"; tCtx.fillRect(0, 0, W, H);
    const bleed = Math.round(W * 0.01);
    tCtx.fillStyle = "rgba(255, 180, 180, 0.5)";
    tCtx.fillRect(0, 0, W, bleed); tCtx.fillRect(0, H - bleed, W, bleed);
    tCtx.fillRect(0, 0, bleed, H); tCtx.fillRect(W - bleed, 0, bleed, H);

    const spineX = (W - SW) / 2; tCtx.fillRect(spineX, 0, SW, H);
    tCtx.beginPath(); tCtx.strokeStyle = "#007acc"; tCtx.lineWidth = 3;
    tCtx.setLineDash([15, 15]);
    tCtx.moveTo(spineX, 0); tCtx.lineTo(spineX, H);
    tCtx.moveTo(spineX + SW, 0); tCtx.lineTo(spineX + SW, H);
    tCtx.stroke(); tCtx.setLineDash([]);

    tCtx.fillStyle = "white"; tCtx.fillRect(spineX + bleed, bleed, SW - (bleed * 2), H - (bleed * 2));
    const barW = 400; const barH = 250; const backW = spineX;
    tCtx.fillStyle = "yellow"; tCtx.fillRect(backW - barW - (bleed * 4), H - barH - (bleed * 4), barW, barH);

    tCtx.fillStyle = "black"; tCtx.font = "bold 30px Arial"; tCtx.textAlign = "center";
    tCtx.fillText("Barcode Area", backW - barW / 2 - (bleed * 4), H - barH / 2 - (bleed * 4));
    const dpiScale = getDPI() / 300;
    tCtx.font = `bold ${Math.round(40 * dpiScale)}px Arial`;
    tCtx.save(); tCtx.translate(spineX + SW / 2, H / 2); tCtx.rotate(-Math.PI / 2);
    tCtx.fillText(`${(SW / getDPI()).toFixed(2)} in Spine`, 0, Math.round(-10 * dpiScale));
    tCtx.restore();
    tCtx.fillText("Back Cover", backW / 2, H / 2); tCtx.fillText("Front Cover", W - (backW / 2), H / 2);

    const img = new Image();
    img.onload = () =>
    {
        window.state.images.template = img;
        $('#dz-template').addClass('has-image');
        updateLabels();
        createScaledBitmap(img, 'template', () => window.requestRender());
    };
    img.src = tCvs.toDataURL('image/webp', 0.5);
}

$(window).on('resize', () =>
{
    window.requestRender();
    renderDomOverlays();
});

generateDefaultTemplate();