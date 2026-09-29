<?php

// Rainfall on the monthly climate layer: the month's total precipitation and
// its count of wet days (3 mm+ within the 9am–7pm sailing window — see
// WeatherFetcher::WET_DAY_SAILING_MM). Nullable because rows fetched
// before this column existed have no rain data until the next weather fetch
// replaces them — null means "not fetched", never "no rain".

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('weather_records', function (Blueprint $table) {
            // decimal(6,1): up to 99,999.9 mm — comfortably above any monthly total on record.
            $table->decimal('rain_mm', 6, 1)->nullable()->after('kph_gust');
            $table->unsignedTinyInteger('wet_days')->nullable()->after('rain_mm');
        });
    }

    public function down(): void
    {
        Schema::table('weather_records', function (Blueprint $table) {
            $table->dropColumn(['rain_mm', 'wet_days']);
        });
    }
};
