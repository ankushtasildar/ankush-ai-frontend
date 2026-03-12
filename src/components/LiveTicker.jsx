/**
 * LiveTicker.jsx
 * Sidebar price ticker — polls Polygon every 15s (free tier),
 * switches to 3s if VITE_POLYGON_TIER=paid
 */
import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
const SYMMBOLS = (import.meta.env.VITE_SYMBOLS || 'AAPL,NVDA,TSLA,SPY,QQQ').split(',')
const INTERVAL = import.meta.env.VITE_POLYGON_TIER