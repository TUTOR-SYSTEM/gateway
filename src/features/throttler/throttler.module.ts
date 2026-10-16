import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

@Module({
    imports : [
        ThrottlerModule.forRoot([
            { name: 'short',  ttl: 1000,  limit: 3 },   // 3 request/giây
            { name: 'medium', ttl: 10000, limit: 20 },  // 20 request/10 giây
            { name: 'long',   ttl: 60000, limit: 100 }, // 100 request/phút
          ])
    ],
    providers: [
        {
            provide : APP_GUARD,
            useClass : ThrottlerGuard
        }
    ]
})

export class ThrottleModule {}