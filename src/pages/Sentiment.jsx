import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

const SCORE_COLOR = (s) =>