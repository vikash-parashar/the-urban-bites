-- Menu corrections checked against the menu board (2026-10-27), and free delivery cut to 3 km.
-- Each update only touches a row still holding the old seeded value, so edits made in the
-- staff area are never overwritten.

-- "ओमिया नान" on the board is a misprint for Onion Naan (confirmed by Vikash).
UPDATE menu_items SET name = 'Onion Naan', updated_at = now() WHERE id = 'omiya-naan' AND name = 'Omiya Naan';
UPDATE menu_items SET name_hi = 'अनियन नान', updated_at = now() WHERE id = 'omiya-naan' AND name_hi = 'ओमिया नान';

-- Hindi spellings copied from the board's typos.
UPDATE menu_items SET name_hi = v.new, updated_at = now()
FROM (VALUES
    ('garlic-naan',       'गारलीक नान',       'गार्लिक नान'),
    ('ginger-naan',       'जनजर नान',         'जिंजर नान'),
    ('missi-roti',        'मेसी रोटी',         'मिस्सी रोटी'),
    ('aloo-paratha',      'आलु परांठा',        'आलू परांठा'),
    ('mushroom-special',  'मसरूम स्पेशल',      'मशरूम स्पेशल'),
    ('manchurian',        'मनच्यूरियन',        'मंचूरियन'),
    ('fried-rice',        'फ्राई राईस',        'फ्राइड राइस'),
    ('peanut-masala',     'पिनट मसाला',        'पीनट मसाला'),
    ('finger-peri-peri',  'फिंगर परी-परी',      'फिंगर पेरी-पेरी'),
    ('sweet-corn-masala', 'स्वीट कोर्न मसाला',   'स्वीट कॉर्न मसाला')
) AS v(id, old, new)
WHERE menu_items.id = v.id AND menu_items.name_hi = v.old;

-- Naan, roti and paratha prices on the board are per piece.
UPDATE menu_items SET description = '1 piece', updated_at = now()
WHERE category_id = 'breads' AND description = '';

-- These showed another dish's photo (chilli paneer, peanut masala, raita). No photo is better than a wrong one.
UPDATE menu_items SET image = '', updated_at = now()
WHERE (id, image) IN (('manchurian', 'chilli-paneer'), ('fried-rice', 'chilli-paneer'), ('sweet-corn-masala', 'peanut-masala'), ('lassi', 'raita'));

-- Free delivery within 3 km on orders of ₹500 or more (was 5 km).
UPDATE shop_settings SET free_delivery_km = 3, updated_at = now() WHERE id = 1;
