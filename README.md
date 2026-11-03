# BIZORA AI v1.2

All-in-one business management platform with POS, inventory, CCTV monitoring, restaurant management, and AI-powered analytics.

## Stack
- Static frontend (HTML, CSS, JavaScript)
- Supabase Auth and PostgreSQL backend
- Supabase Row Level Security (RLS)

## Run
Open `index.html` through a local web server or deploy with GitHub Pages.
Configure the production domain in Supabase Authentication URL settings.

## Important
This is an early connected frontend, not a production-certified system. CCTV streaming requires a secure RTSP/ONVIF gateway. Review database RLS policies and test each workflow before using real business data. Never put Supabase service-role keys or camera passwords in browser code.
