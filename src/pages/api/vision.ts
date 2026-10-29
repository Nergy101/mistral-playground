// POST /api/vision — multipart form: "image" file, "mode" (describe|extract),
// "preset" (receipt|whiteboard|chart|custom). Extract mode uses a JSON schema
// per preset. Returns the result plus debug info for the "Under the hood" drawer.
import type { APIRoute } from 'astro';
import { chatDebug, textOf } from '../../lib/mistral';
import { BudgetExceededError } from '../../lib/budget';

export const prerender = false;

const PRESET_SCHEMAS: Record<string, { name: string; schema: object; hint: string }> = {
  receipt: {
    name: 'receipt',
    schema: {
      type: 'object',
      properties: {
        merchant: { type: 'string' },
        city: { type: 'string' },
        items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: 'number' }, price: { type: 'number' } }, required: ['name', 'qty'] } },
        total: { type: 'number' },
        currency: { type: 'string' },
      },
      required: ['merchant', 'items', 'total', 'currency'],
    },
    hint: 'Extract the receipt as JSON: merchant, city, items[{name, qty, price}], total, currency.',
  },
  whiteboard: {
    name: 'whiteboard',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        sections: { type: 'array', items: { type: 'string' } },
        action_items: { type: 'array', items: { type: 'string' } },
        people: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'sections'],
    },
    hint: 'Extract the whiteboard as JSON: title, sections[], action_items[], people[]. Transcribe any handwriting.',
  },
  chart: {
    name: 'chart',
    schema: {
      type: 'object',
      properties: {
        chart_type: { type: 'string' },
        title: { type: 'string' },
        x_axis: { type: 'string' },
        y_axis: { type: 'string' },
        series: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, values: { type: 'array', items: { type: 'number' } } }, required: ['name', 'values'] } },
        takeaway: { type: 'string' },
      },
      required: ['chart_type', 'title', 'series', 'takeaway'],
    },
    hint: 'Extract the chart as JSON: chart_type, title, x_axis, y_axis, series[{name, values[]}], takeaway.',
  },
  image: {
    name: 'image',
    schema: {
      type: 'object',
      properties: {
        scene_type: { type: 'string' },
        setting: { type: 'string' },
        main_subjects: { type: 'array', items: { type: 'string' } },
        visible_text: { type: 'array', items: { type: 'string' } },
        colors: { type: 'array', items: { type: 'string' } },
        estimated_time_of_day: { type: 'string' },
      },
      required: ['scene_type', 'main_subjects'],
    },
    hint: 'Analyze this image and return JSON: scene_type, setting, main_subjects[], visible_text[], colors[], estimated_time_of_day.',
  },
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) {
      return Response.json({ error: 'Missing "image" file in form data' }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return Response.json({ error: 'Image too large (max 15 MB)' }, { status: 413 });
    }
    const mode = form.get('mode') === 'describe' ? 'describe' : 'extract';
    const presetKey = String(form.get('preset') || 'custom');
    const preset = PRESET_SCHEMAS[presetKey] ?? PRESET_SCHEMAS.image;

    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const imageUrl = `data:${file.type || 'image/jpeg'};base64,${b64}`;

    if (mode === 'describe') {
      const { data, debug } = await chatDebug({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image in vivid detail — what is it, what is happening, and what stands out. Keep it to at most 6 sentences.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }],
      });
      return Response.json({ mode, description: textOf(data.choices[0].message), debug });
    }

    const { data, debug } = await chatDebug({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: preset.hint + ' Return ONLY the JSON.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: preset.name, strict: true, schema: preset.schema },
      },
    });
    const raw = textOf(data.choices[0].message);
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw); } catch { /* leave null */ }
    return Response.json({ mode, preset: presetKey, extractionRaw: raw, extraction: parsed, debug });
  } catch (e: any) {
    if (e instanceof BudgetExceededError) return Response.json({ error: e.message }, { status: 429 });
    return Response.json({ error: e.message }, { status: 500 });
  }
};
