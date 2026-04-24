package com.flashcastelo.redepdv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.UUID
import kotlinx.coroutines.launch
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

private const val BACKEND_BASE_URL = "http://10.0.2.2:3333/api/"
private const val PAYMENT_BASE_URL = "http://10.0.2.2:3000/"

data class BackendAuthRequest(val email: String, val password: String)

data class BackendUserDto(
    val id: String,
    val name: String,
    val email: String,
    val role: String
)

data class BackendAuthResponse(
    val token: String,
    val user: BackendUserDto
)

data class BackendProductDto(
    val id: String,
    val name: String,
    val sku: String?,
    val price: String,
    val stock_quantity: String,
    val category: String?
)

data class BackendProductsResponse(
    val data: List<BackendProductDto>
)

data class SaleItemRequest(
    val product_id: String,
    val quantity: Double,
    val unit_price: Double
)

data class CreateSaleRequest(
    val idempotency_key: String,
    val items: List<SaleItemRequest>
)

data class SaleDto(
    val id: String,
    val status: String,
    val subtotal: String,
    val total: String,
    val idempotency_key: String
)

data class CreateSaleResponse(
    val data: SaleDto
)

data class ConfirmSaleRequest(
    val method: String,
    val status: String,
    val transaction_id: String? = null,
    val authorization_code: String? = null,
    val nsu: String? = null
)

data class ConfirmSaleData(
    val sale_id: String,
    val sale_status: String,
    val payment_status: String
)

data class ConfirmSaleResponse(
    val data: ConfirmSaleData
)

data class PaymentProcessRequest(
    val amount: Double,
    val installments: Int,
    val description: String? = null,
    val reference: String? = null,
    val paymentType: String? = null
)

data class PaymentProcessResponse(
    val success: Boolean,
    val transactionId: String? = null,
    val paymentIntentId: String? = null,
    val authCode: String? = null,
    val nsu: String? = null,
    val bank: String? = null,
    val status: String? = null,
    val error: String? = null
)

data class PaymentMachineHealth(
    val provider: String? = null,
    val configured: Boolean,
    val mode: String,
    val terminal: String? = null,
    val device_id: String? = null,
    val pos_id: String? = null,
    val api_url: String? = null
)

data class PaymentHealthResponse(
    val service: String,
    val status: String,
    val version: String,
    val machine: PaymentMachineHealth? = null,
    val mercadopago: PaymentMachineHealth? = null,
    val rede: PaymentMachineHealth? = null
)

interface BackendApi {
    @POST("auth/login")
    suspend fun login(@Body request: BackendAuthRequest): BackendAuthResponse

    @GET("products")
    suspend fun getProducts(): BackendProductsResponse

    @POST("sales")
    suspend fun createSale(@Body request: CreateSaleRequest): CreateSaleResponse

    @POST("sales/{id}/confirm")
    suspend fun confirmSale(
        @Path("id") saleId: String,
        @Body request: ConfirmSaleRequest
    ): ConfirmSaleResponse
}

interface PaymentApi {
    @GET("/")
    suspend fun health(): PaymentHealthResponse

    @POST("api/payment/process")
    suspend fun processPayment(@Body request: PaymentProcessRequest): PaymentProcessResponse
}

class TokenInterceptor(private val tokenProvider: () -> String?) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider()
        val original = chain.request()
        val builder = original.newBuilder()
        if (!token.isNullOrBlank()) {
            builder.addHeader("Authorization", "Bearer $token")
        }
        return chain.proceed(builder.build())
    }
}

class PdvRepository {
    private var authToken: String? = null

    private val backendClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(TokenInterceptor { authToken })
        .build()

    private val backendApi: BackendApi = Retrofit.Builder()
        .baseUrl(BACKEND_BASE_URL)
        .client(backendClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(BackendApi::class.java)

    private val paymentApi: PaymentApi = Retrofit.Builder()
        .baseUrl(PAYMENT_BASE_URL)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(PaymentApi::class.java)

    suspend fun loginDefaultUser(): BackendUserDto {
        val response = backendApi.login(
            BackendAuthRequest(
                email = "admin@flashcastelo.com",
                password = "123456"
            )
        )
        authToken = response.token
        return response.user
    }

    suspend fun getProducts(): List<ProductItem> {
        val response = backendApi.getProducts()
        return response.data.map {
            ProductItem(
                id = it.id,
                name = it.name,
                price = it.price.toDoubleOrNull() ?: 0.0,
                stock = (it.stock_quantity.toDoubleOrNull() ?: 0.0).toInt(),
                category = it.category ?: "Sem categoria"
            )
        }
    }

    suspend fun getPaymentHealth(): PaymentHealthResponse {
        return paymentApi.health()
    }

    suspend fun processSaleWithCard(cart: List<CartItem>): String {
        val idempotency = "android-${System.currentTimeMillis()}-${UUID.randomUUID()}"
        val items = cart.map {
            SaleItemRequest(
                product_id = it.product.id,
                quantity = it.qty.toDouble(),
                unit_price = it.product.price
            )
        }

        val createdSale = backendApi.createSale(CreateSaleRequest(idempotency, items)).data
        val total = cart.sumOf { it.product.price * it.qty }

        val paymentResult = paymentApi.processPayment(
            PaymentProcessRequest(
                amount = total,
                installments = 1,
                description = "Venda Flash Castelo",
                reference = createdSale.id
            )
        )

        if (!paymentResult.success) {
            val rawStatus = paymentResult.status?.lowercase() ?: ""
            val isDenied = rawStatus.contains("denied") ||
                rawStatus.contains("rejected") ||
                rawStatus.contains("cancel") ||
                rawStatus.contains("failed") ||
                rawStatus.contains("error")

            val isPending = rawStatus.contains("pending") || rawStatus.contains("process")

            if (isDenied) {
                backendApi.confirmSale(
                    saleId = createdSale.id,
                    request = ConfirmSaleRequest(
                        method = "card",
                        status = "denied"
                    )
                )
                val reason = paymentResult.error ?: paymentResult.status ?: "erro desconhecido"
                throw IllegalStateException("Pagamento negado: $reason")
            }

            if (isPending) {
                val reference = paymentResult.paymentIntentId ?: createdSale.id
                throw IllegalStateException("Pagamento pendente na maquininha. Referência: $reference")
            }

            val reason = paymentResult.error ?: paymentResult.status ?: "erro desconhecido"
            throw IllegalStateException("Falha ao processar pagamento: $reason")
        }

        val transactionReference = paymentResult.transactionId ?: paymentResult.paymentIntentId

        backendApi.confirmSale(
            saleId = createdSale.id,
            request = ConfirmSaleRequest(
                method = "card",
                status = "approved",
                transaction_id = transactionReference,
                authorization_code = paymentResult.authCode,
                nsu = paymentResult.nsu
            )
        )

        return "Pagamento aprovado no Mercado Pago. NSU: ${paymentResult.nsu ?: "-"}"
    }
}

data class ProductItem(
    val id: String,
    val name: String,
    val price: Double,
    val stock: Int,
    val category: String
)

data class CartItem(
    val product: ProductItem,
    val qty: Int
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = AppColors.Black) {
                    RedePdvScreen()
                }
            }
        }
    }
}

object AppColors {
    val Black = Color(0xFF0A0A0A)
    val BlackSecondary = Color(0xFF0F0F0F)
    val Card = Color(0xFF151515)
    val Card2 = Color(0xFF1A1A1A)
    val Yellow = Color(0xFFFBBF24)
    val YellowDark = Color(0xFFF59E0B)
    val Text = Color(0xFFFFFFFF)
    val TextSecondary = Color(0xFFD1D5DB)
    val Muted = Color(0xFF9CA3AF)
    val Border = Color(0xFF262626)
    val Success = Color(0xFF8AE08A)
}

@Composable
fun RedePdvScreen() {
    val scope = rememberCoroutineScope()
    val repository = remember { PdvRepository() }

    val products = remember { mutableStateListOf<ProductItem>() }
    val cart = remember { mutableStateListOf<CartItem>() }

    var isLoading by remember { mutableStateOf(true) }
    var message by remember { mutableStateOf("Inicializando...") }
    var machineProvider by remember { mutableStateOf("--") }
    var machineMode by remember { mutableStateOf("--") }
    var machineTerminal by remember { mutableStateOf("--") }
    var machineConfigured by remember { mutableStateOf(false) }

    val totalStock = products.sumOf { it.stock }
    val cartTotal = cart.sumOf { it.product.price * it.qty }

    fun addToCart(product: ProductItem) {
        val index = cart.indexOfFirst { it.product.id == product.id }
        if (index >= 0) {
            val current = cart[index]
            cart[index] = current.copy(qty = current.qty + 1)
        } else {
            cart.add(CartItem(product = product, qty = 1))
        }
    }

    fun loadData() {
        scope.launch {
            try {
                isLoading = true
                message = "Autenticando no backend..."
                repository.loginDefaultUser()

                message = "Carregando catalogo..."
                val loadedProducts = repository.getProducts()
                products.clear()
                products.addAll(loadedProducts)

                val health = repository.getPaymentHealth()
                val machine = health.machine ?: health.mercadopago ?: health.rede
                machineProvider = machine?.provider ?: "MERCADO_PAGO_POINT"
                machineMode = machine?.mode ?: "--"
                machineTerminal = machine?.device_id ?: machine?.terminal ?: machine?.pos_id ?: "--"
                machineConfigured = machine?.configured ?: false

                message = "Sistema pronto"
            } catch (e: Exception) {
                message = "Erro: ${e.message ?: "falha ao carregar"}"
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadData()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(AppColors.Black)
            .padding(16.dp)
    ) {
        Text(
            text = "Flash Castelo Foodtruck",
            color = AppColors.Yellow,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "PDV Mercado Pago Point",
            color = AppColors.TextSecondary,
            fontSize = 13.sp
        )
        Text(
            text = message,
            color = AppColors.Muted,
            fontSize = 12.sp
        )

        Spacer(modifier = Modifier.height(14.dp))

        StatusCard(
            title = "Status Maquininha",
            lines = listOf(
                "Provedor: $machineProvider",
                "Terminal: $machineTerminal",
                "Modo: $machineMode",
                "Conectividade: ${if (machineConfigured) "Operacional" else "Simulacao"}"
            )
        )

        Spacer(modifier = Modifier.height(12.dp))

        Card(
            colors = CardDefaults.cardColors(containerColor = AppColors.Card),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, AppColors.Border, RoundedCornerShape(12.dp))
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Catalogo do backend",
                        color = AppColors.Yellow,
                        fontWeight = FontWeight.Bold
                    )
                    TextButton(onClick = { loadData() }) {
                        Text("Atualizar", color = AppColors.Yellow)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Toque no produto para adicionar ao carrinho",
                    color = AppColors.Muted,
                    fontSize = 12.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Card(
            colors = CardDefaults.cardColors(containerColor = AppColors.Card2),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .border(1.dp, AppColors.Border, RoundedCornerShape(12.dp))
        ) {
            Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Estoque atual",
                        color = AppColors.Yellow,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Itens: ${products.size} | Qtd total: $totalStock",
                        color = AppColors.TextSecondary,
                        fontSize = 12.sp
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                if (products.isEmpty()) {
                    Text(
                        text = "Sem dados. Verifique backend em $BACKEND_BASE_URL",
                        color = AppColors.Muted
                    )
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(products) { item ->
                            ProductRow(item = item, onAdd = { addToCart(item) })
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        Card(
            colors = CardDefaults.cardColors(containerColor = AppColors.Card2),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, AppColors.Border, RoundedCornerShape(12.dp))
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = "Carrinho",
                    color = AppColors.Yellow,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(6.dp))

                if (cart.isEmpty()) {
                    Text("Vazio", color = AppColors.Muted)
                } else {
                    cart.forEach {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("${it.product.name} x${it.qty}", color = AppColors.TextSecondary, fontSize = 12.sp)
                            Text("R$ ${"%.2f".format(it.product.price * it.qty)}", color = AppColors.Yellow, fontSize = 12.sp)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))
                Text("Total: R$ ${"%.2f".format(cartTotal)}", color = AppColors.Text, fontWeight = FontWeight.SemiBold)
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        Button(
            onClick = {
                if (cart.isEmpty() || isLoading) return@Button
                scope.launch {
                    try {
                        isLoading = true
                        message = "Criando venda e processando maquininha..."
                        val result = repository.processSaleWithCard(cart.toList())
                        cart.clear()
                        message = result
                        loadData()
                    } catch (e: Exception) {
                        message = "Falha no pagamento: ${e.message ?: "erro"}"
                    } finally {
                        isLoading = false
                    }
                }
            },
            colors = ButtonDefaults.buttonColors(
                containerColor = AppColors.YellowDark,
                contentColor = AppColors.Black
            ),
            modifier = Modifier.fillMaxWidth(),
            enabled = cart.isNotEmpty() && !isLoading
        ) {
            if (isLoading) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(
                        color = AppColors.Black,
                        strokeWidth = 2.dp,
                        modifier = Modifier.width(18.dp).height(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Processando...", fontWeight = FontWeight.Bold)
                }
            } else {
                Text("Processar pagamento na maquininha", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun StatusCard(title: String, lines: List<String>) {
    Card(
        colors = CardDefaults.cardColors(containerColor = AppColors.Card2),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, AppColors.Border, RoundedCornerShape(12.dp))
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(text = title, color = AppColors.Yellow, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(6.dp))
            lines.forEach {
                Text(text = it, color = AppColors.Success, fontSize = 12.sp)
            }
        }
    }
}

@Composable
fun ProductRow(item: ProductItem, onAdd: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(AppColors.Card, RoundedCornerShape(10.dp))
            .border(1.dp, AppColors.Border, RoundedCornerShape(10.dp))
            .clickable { onAdd() }
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(item.name, color = AppColors.Text, fontWeight = FontWeight.SemiBold)
            Text(item.category, color = AppColors.Muted, fontSize = 11.sp)
            Text("R$ ${"%.2f".format(item.price)}", color = AppColors.Yellow, fontSize = 13.sp)
        }
        Spacer(modifier = Modifier.width(8.dp))
        Text("Estoque: ${item.stock}", color = AppColors.TextSecondary, fontSize = 12.sp)
    }
}
