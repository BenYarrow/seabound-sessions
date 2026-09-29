<?php

// One month of climate averages for a spot guide (temp + wind/gust in kts, mph,
// kph, plus rainfall: total mm and wet-day count, null until fetched). Unique per (spot_guide_id, year, month). Feeds the destination charts.

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WeatherRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'spot_guide_id', 'year', 'month',
        'avg_temp', 'kts_wind', 'kts_gust',
        'mph_wind', 'mph_gust', 'kph_wind', 'kph_gust',
        'rain_mm', 'wet_days',
    ];

    protected $casts = [
        'avg_temp' => 'decimal:1',
        'kts_wind' => 'decimal:1',
        'kts_gust' => 'decimal:1',
        'rain_mm' => 'decimal:1',
        'wet_days' => 'integer',
    ];

    private const MONTH_NAMES = [
        1 => 'January', 2 => 'February', 3 => 'March', 4 => 'April',
        5 => 'May', 6 => 'June', 7 => 'July', 8 => 'August',
        9 => 'September', 10 => 'October', 11 => 'November', 12 => 'December',
    ];

    /** Human-readable month name for the stored month number (1–12), else ''. */
    public function getMonthNameAttribute(): string
    {
        return self::MONTH_NAMES[$this->month] ?? '';
    }

    public function spotGuide(): BelongsTo
    {
        return $this->belongsTo(SpotGuide::class);
    }

    /** Filter to a single year. */
    public function scopeForYear($query, int $year)
    {
        return $query->where('year', $year);
    }

    /** Filter to a single month number (1–12). */
    public function scopeForMonth($query, int $month)
    {
        return $query->where('month', $month);
    }
}
